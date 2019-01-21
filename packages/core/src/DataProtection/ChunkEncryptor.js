// @flow
import varint from 'varint';
import arraychunks from 'array.chunk';

import { tcrypto, aead, random, utils } from '@tanker/crypto';

import { ChunkIndexOutOfRange, ChunkNotFound, DecryptFailed, InvalidArgument, InvalidSeal } from '../errors';
import { type EncryptionOptions, validateEncryptionOptions } from './EncryptionOptions';
import { isShareWithOptionsEmpty } from './ShareWithOptions';
import * as Serialize from '../Blocks/Serialize';

const currentSealVersion = 3;
const firstSupportedVersion = 3;

// Type deprecated in 1.6.0
export type NewChunk = {
  encryptedData: Uint8Array,
  index: number,
};

export interface EncryptorInterface {
  encryptData(plain: Uint8Array, options?: EncryptionOptions): Promise<Uint8Array>;
  decryptData(cipher: Uint8Array): Promise<Uint8Array>;
}

function makeNullArray(length: number): Array<null> {
  return Array.from({ length }, () => null);
}

function deserializeEmptyRanges(buf: Uint8Array): Array<[number, number]> {
  const emptyRanges: Array<[number, number]> = [];

  for (let offset = 0; offset < buf.length;) {
    const begin = varint.decode(buf, offset);
    offset += varint.decode.bytes;
    // no need to check for truncated range, it will fail when checking keys
    const end = varint.decode(buf, offset);
    offset += varint.decode.bytes;
    if (end < begin)
      throw new InvalidSeal(`Seal.deserialize: invalid empty range, begin: ${begin}, end: ${end}`);
    emptyRanges.push([begin, end]);
  }
  return emptyRanges;
}

function computeEmptyIndexes(keys: Array<?Uint8Array>): Array<number> {
  const ret: Array<number> = [];
  for (let i = 0; i < keys.length; i++) {
    if (!keys[i])
      ret.push(i);
  }
  return ret;
}

function computeEmptyRanges(keys: Array<?Uint8Array>): Array<[number, number]> {
  const emptyRanges: Array<[number, number]> = [];
  const emptyIndexes = computeEmptyIndexes(keys);

  if (emptyIndexes.length === 0)
    return emptyRanges;
  emptyRanges.push([emptyIndexes[0], emptyIndexes[0]]);
  for (let i = 1; i < emptyIndexes.length; i++) {
    if (emptyIndexes[i] - emptyIndexes[i - 1] !== 1) {
      emptyRanges[emptyRanges.length - 1][1] = emptyIndexes[i - 1];
      emptyRanges.push([emptyIndexes[i], emptyIndexes[i]]);
    }
  }
  emptyRanges[emptyRanges.length - 1][1] = emptyIndexes[emptyIndexes.length - 1];

  return emptyRanges;
}

function serializeEmptyRanges(emptyRanges: Array<[number, number]>): Uint8Array {
  let offset = 0;
  const buf = [];
  for (let i = 0; i < emptyRanges.length; i++) {
    varint.encode(emptyRanges[i][0], buf, offset);
    offset += varint.encode.bytes;
    varint.encode(emptyRanges[i][1], buf, offset);
    offset += varint.encode.bytes;
  }
  return new Uint8Array(buf);
}

class Seal {
  emptyRanges: Array<[number, number]>;
  keys: Array<Uint8Array>;

  constructor(emptyRanges: Array<[number, number]>, keys: Array<Uint8Array>) {
    this.emptyRanges = emptyRanges;
    this.keys = keys;
  }

  serialize(): Uint8Array {
    const serializedEmptyRanges = serializeEmptyRanges(this.emptyRanges);
    const emptyRangesSize = new Uint8Array(varint.encode(serializedEmptyRanges.length));
    const totalSize = varint.encodingLength(currentSealVersion) + emptyRangesSize.length + serializedEmptyRanges.length + (this.keys.length * tcrypto.SYMMETRIC_KEY_SIZE);

    const buf = new Uint8Array(totalSize);
    varint.encode(currentSealVersion, buf);
    let offset = varint.encode.bytes;
    offset = Serialize.setStaticArray(emptyRangesSize, buf, offset);
    offset = Serialize.setStaticArray(serializedEmptyRanges, buf, offset);
    for (let i = 0; i < this.keys.length; i++)
      offset = Serialize.setStaticArray(this.keys[i], buf, offset);
    return buf;
  }

  static deserialize(serializedSeal: Uint8Array): Seal {
    // skip version number
    const versionOffset = varint.encodingLength(currentSealVersion);
    const emptyRangesSize = varint.decode(serializedSeal, versionOffset);
    let offset = versionOffset + varint.decode.bytes;

    let emptyRanges;
    try {
      emptyRanges = deserializeEmptyRanges(serializedSeal.subarray(offset, offset + emptyRangesSize));
    } catch (e) {
      throw new InvalidSeal('deserialize: ', e);
    }
    offset += emptyRangesSize;

    if ((serializedSeal.length - offset) % tcrypto.SYMMETRIC_KEY_SIZE !== 0)
      throw new InvalidSeal('deserialize: truncated keys in seal');

    const keys = arraychunks(serializedSeal.subarray(offset), tcrypto.SYMMETRIC_KEY_SIZE);
    return new Seal(emptyRanges, keys);
  }

  static build(maybeNullKeys: Array<?Uint8Array>): Seal {
    const emptyRanges = computeEmptyRanges(maybeNullKeys);
    // $FlowIssue
    const keys = (maybeNullKeys.filter(k => k): Array<Uint8Array>);
    return new Seal(emptyRanges, keys);
  }
}

function restoreNullKeys(seal: Seal): Array<?Uint8Array> {
  const chunkKeys: Array<?Uint8Array> = (seal.keys: any);

  for (let i = 0; i < seal.emptyRanges.length; i++) {
    const [rangeStart, rangeEnd] = seal.emptyRanges[i];
    const rangeSize = rangeEnd - rangeStart + 1;
    chunkKeys.splice(rangeStart, 0, ...makeNullArray(rangeSize));
  }
  return chunkKeys;
}

function getChunkKeysV3(serializedSeal: Uint8Array): Array<?Uint8Array> {
  const seal = Seal.deserialize(serializedSeal);
  return restoreNullKeys(seal);
}

// Exported for tests
export function getChunkKeys(seal: Uint8Array): Array<?Uint8Array> {
  const version = varint.decode(seal);
  if (version > currentSealVersion)
    throw new InvalidSeal('seal version too recent');
  if (version < firstSupportedVersion)
    throw new InvalidSeal('seal version too old');

  return getChunkKeysV3(seal);
}

export default class ChunkEncryptor {
  encryptor: EncryptorInterface;
  chunkKeys: Array<?Uint8Array>;
  defaultShareWithSelf: bool;

  constructor(options: { encryptor: EncryptorInterface, chunkKeys: Array<?Uint8Array>, defaultShareWithSelf: bool }) {
    Object.defineProperty(this, 'encryptor', { value: options.encryptor });
    this.chunkKeys = options.chunkKeys;
    this.defaultShareWithSelf = options.defaultShareWithSelf;
  }

  get length(): number {
    return this.chunkKeys.length;
  }

  assertIndexExists(index: number) {
    if (index < 0 || index >= this.chunkKeys.length)
      throw new ChunkIndexOutOfRange(index, this.chunkKeys.length);
    if (!this.chunkKeys[index])
      throw new ChunkNotFound(index);
  }

  // Latest API (string as input)
  async encrypt(clearText: string, index?: number): Promise<Uint8Array> {
    if (typeof clearText !== 'string')
      throw new InvalidArgument('clearText', 'string', clearText);

    if (typeof index !== 'undefined' && typeof index !== 'number')
      throw new InvalidArgument('index', 'number', index);

    const clearData = utils.fromString(clearText);

    return this.encryptData(clearData, index);
  }

  // Latest API (Uint8Array as input)
  async encryptData(clearData: Uint8Array, index?: number): Promise<Uint8Array> {
    if (!(clearData instanceof Uint8Array))
      throw new InvalidArgument('clearData', 'Uint8Array', clearData);

    if (typeof index !== 'undefined' && typeof index !== 'number')
      throw new InvalidArgument('index', 'number', index);

    if (typeof index === 'number' && index < 0)
      throw new ChunkIndexOutOfRange(index, this.chunkKeys.length);

    const idx = typeof index === 'number' ? index : this.chunkKeys.length;

    if (idx > this.chunkKeys.length) {
      const rangeSize = idx - this.chunkKeys.length;
      this.chunkKeys.push(...makeNullArray(rangeSize));
    }

    const ephemeralKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    // do not use encryptor.encrypt here, it would save the key and possibly share it!
    const encryptedData = await aead.encryptAEADv1(ephemeralKey, clearData);
    this.chunkKeys[idx] = ephemeralKey;
    return encryptedData;
  }

  // Latest API (string as output)
  async decrypt(encryptedChunk: Uint8Array | number, index: number | Uint8Array): Promise<string> {
    // Arguments were in reverse order in legacy API (< 1.6.0)
    if (typeof encryptedChunk === 'number') {
      console.warn('ChunkEncryptor.prototype.decrypt() signature changed in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');
      [encryptedChunk, index] = [index, encryptedChunk]; // eslint-disable-line no-param-reassign
    }

    if (!(encryptedChunk instanceof Uint8Array))
      throw new InvalidArgument('encryptedChunk', 'Uint8Array', encryptedChunk);

    if (typeof index !== 'number')
      throw new InvalidArgument('index', 'number', index);

    return utils.toString(await this.decryptData(encryptedChunk, index));
  }

  // Latest API (Uint8Array as output)
  async decryptData(encryptedChunk: Uint8Array | number, index: number | Uint8Array): Promise<Uint8Array> {
    // Arguments were in reverse order in legacy API (< 1.6.0)
    if (typeof encryptedChunk === 'number') {
      console.warn('ChunkEncryptor.prototype.decryptData() signature changed in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');
      [encryptedChunk, index] = [index, encryptedChunk]; // eslint-disable-line no-param-reassign
    }

    if (!(encryptedChunk instanceof Uint8Array))
      throw new InvalidArgument('encryptedChunk', 'Uint8Array', encryptedChunk);

    if (typeof index !== 'number')
      throw new InvalidArgument('index', 'number', index);

    this.assertIndexExists(index);
    const key = this.chunkKeys[index];

    try {
      // The presence of key is ensured by a previous assertIndexExists call
      // $FlowExpectedError (but Flow doesn't known it...)
      return new Uint8Array(await aead.decryptAEADv1(key, encryptedChunk));
    } catch (e) {
      // note that the resourceId could very well be corrupted
      throw new DecryptFailed(e, aead.extractMac(encryptedChunk), index);
    }
  }

  async seal(options?: EncryptionOptions): Promise<Uint8Array> {
    if (!validateEncryptionOptions(options))
      throw new InvalidArgument('options', '{ shareWithUsers?: Array<String>, shareWithGroups?: Array<String> }', options);

    const opts = { shareWithSelf: this.defaultShareWithSelf, ...options };

    if (opts.shareWithSelf === false && isShareWithOptionsEmpty(opts))
      throw new InvalidArgument('options.shareWith*', 'options.shareWithUsers or options.shareWithGroups must contain recipients when options.shareWithSelf === false', opts);

    const seal = Seal.build(this.chunkKeys);
    const serializedSeal = seal.serialize();
    return this.encryptor.encryptData(serializedSeal, opts);
  }

  remove(indexes: Array<number>): void {
    if (!(indexes instanceof Array))
      throw new InvalidArgument('indexes', 'Array<number>', indexes);

    this.chunkKeys = this.chunkKeys.filter((_k, index) => indexes.indexOf(index) === -1);
  }


  // ALL INSTANCE METHODS BELOW HAVE BEEN DEPRECATED SINCE 1.6.0:

  async encryptAt(index: number, clearText: string): Promise<Uint8Array> {
    console.warn('ChunkEncryptor.prototype.encryptAt() has been deprecated in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');

    if (typeof clearText !== 'string')
      throw new InvalidArgument('clearText', 'string', clearText);

    return this.encryptAtData(index, utils.fromString(clearText));
  }

  async encryptAppend(clearText: string): Promise<NewChunk> {
    console.warn('ChunkEncryptor.prototype.encryptAppend() has been deprecated in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');

    if (typeof clearText !== 'string')
      throw new InvalidArgument('clearText', 'string', clearText);

    return this.encryptAppendData(utils.fromString(clearText));
  }

  async encryptReplace(index: number, clearText: string): Promise<Uint8Array> {
    console.warn('ChunkEncryptor.prototype.encryptReplace() has been deprecated in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');

    if (typeof clearText !== 'string')
      throw new InvalidArgument('clearText', 'string', clearText);

    return this.encryptReplaceData(index, utils.fromString(clearText));
  }

  async encryptAtData(index: number, clearData: Uint8Array): Promise<Uint8Array> {
    console.warn('ChunkEncryptor.prototype.encryptAtData() has been deprecated in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');

    if (typeof index !== 'number')
      throw new InvalidArgument('index', 'number', index);

    if (!(clearData instanceof Uint8Array))
      throw new InvalidArgument('clearData', 'Uint8Array', clearData);

    if (index < 0)
      throw new ChunkIndexOutOfRange(index, this.chunkKeys.length);

    if (index > this.chunkKeys.length) {
      const rangeSize = index - this.chunkKeys.length;
      this.chunkKeys.push(...makeNullArray(rangeSize));
    }

    const ephemeralKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    // do not use encryptor.encrypt here, it would save the key and possibly share it!
    const encryptedData = await aead.encryptAEADv1(ephemeralKey, clearData);
    this.chunkKeys[index] = ephemeralKey;
    return encryptedData;
  }

  async encryptAppendData(clearData: Uint8Array): Promise<NewChunk> {
    console.warn('ChunkEncryptor.prototype.encryptAppendData() has been deprecated in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');

    const index = this.chunkKeys.length; // previous index + 1 to append
    return { index, encryptedData: await this.encryptAtData(index, clearData) };
  }

  async encryptReplaceData(index: number, clearData: Uint8Array): Promise<Uint8Array> {
    console.warn('ChunkEncryptor.prototype.encryptReplaceData() has been deprecated in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');

    if (typeof index !== 'number')
      throw new InvalidArgument('index', 'number', index);

    this.assertIndexExists(index);
    return this.encryptAtData(index, clearData);
  }

  erase(indexes: Array<number>): void {
    console.warn('ChunkEncryptor.prototype.erase() has been deprecated in 1.6.0, please check migration guide in https://tanker.io/docs/latest/migration-guide/');

    if (!(indexes instanceof Array))
      throw new InvalidArgument('indexes', 'Array<number>', indexes);

    for (let i = 0; i < indexes.length; i++) {
      const j = indexes[i];
      if (j > 0 && j < this.chunkKeys.length)
        this.chunkKeys[j] = null;
    }
  }

  // END OF DEPRECATED SINCE 1.6.0 SECTION
}

export async function makeChunkEncryptor(options: { encryptor: EncryptorInterface, seal?: Uint8Array, defaultShareWithSelf: bool }): Promise<ChunkEncryptor> {
  let chunkKeys: Array<?Uint8Array> = [];

  if (options.seal) {
    const clearSeal = await options.encryptor.decryptData(options.seal);
    chunkKeys = getChunkKeys(clearSeal);
  }

  return new ChunkEncryptor({ encryptor: options.encryptor, chunkKeys, defaultShareWithSelf: options.defaultShareWithSelf });
}
