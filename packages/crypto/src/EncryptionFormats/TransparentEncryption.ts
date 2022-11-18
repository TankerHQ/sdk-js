import { InvalidArgument, DecryptionFailed } from '@tanker/errors';

import * as number from '../number';
import * as aead from '../aead';
import type { Padding } from '../padding';
import { paddedFromClearSize, padClearData, removePadding } from '../padding';
import { random } from '../random';
import { deriveSessionKey, getKeyFromCompositeResourceId, serializeCompositeResourceId } from '../resourceId';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import { tryDecryptAEAD } from './helpers';
import type { KeyMapper } from './KeyMapper';

type EncryptionData = {
  sessionId: Uint8Array;
  resourceId: Uint8Array;
  encryptedData: Uint8Array;
};

export type StreamHeaderData = Omit<EncryptionData, 'encryptedData'> & { encryptedChunkSize: number };

type Version = 9 | 10;
type StreamVersion = 11;

const serializeStreamHeader = (version: StreamVersion, data: StreamHeaderData) => utils.concatArrays(
  new Uint8Array([version]),
  data.sessionId,
  data.resourceId,
  number.toUint32le(data.encryptedChunkSize),
);

const serialize = (version: Version, data: EncryptionData) => utils.concatArrays(new Uint8Array([version]), data.sessionId, data.resourceId, data.encryptedData);

const formatIV = (sessionId: Uint8Array) => {
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE);
  iv.set(sessionId);
  return iv;
};

const encrypt = (version: Version, sessionKey: Uint8Array, plaintext: Uint8Array, sessionId: Uint8Array): EncryptionData => {
  const seed = random(tcrypto.SESSION_SEED_SIZE);

  const resourceKey = deriveSessionKey(sessionKey, seed);

  const iv = formatIV(sessionId);
  const associatedData = utils.concatArrays(Uint8Array.from([version]), sessionId, seed);
  const encryptedData = aead.encryptAEAD(resourceKey, iv, plaintext, associatedData);

  return { encryptedData, sessionId, resourceId: seed };
};

const encryptChunk = (version: StreamVersion, key: Uint8Array, index: number, headerData: StreamHeaderData, clearChunk: Uint8Array): Uint8Array => {
  const ivSeed = formatIV(headerData.sessionId);
  const iv = tcrypto.deriveIV(ivSeed, index);

  const associatedData = serializeStreamHeader(version, headerData);
  const encryptedData = aead.encryptAEAD(key, iv, clearChunk, associatedData);
  return encryptedData;
};

const unserializeStreamHeader = (version: StreamVersion, overhead: number, buffer: Uint8Array): StreamHeaderData => {
  const bufferVersion = buffer[0];

  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  if (buffer.length < overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${overhead} for encryption v${version}` });
  }

  let pos = 1;
  const sessionId = buffer.subarray(pos, pos + tcrypto.SESSION_ID_SIZE);
  pos += tcrypto.SESSION_ID_SIZE;

  const seed = buffer.subarray(pos, pos + tcrypto.SESSION_SEED_SIZE);
  pos += tcrypto.SESSION_SEED_SIZE;

  const encryptedChunkSize = number.fromUint32le(buffer.subarray(pos, pos + number.uint32ByteSize));

  return { sessionId, resourceId: seed, encryptedChunkSize };
};

const unserialize = (version: Version, overhead: number, buffer: Uint8Array): EncryptionData => {
  const bufferVersion = buffer[0];

  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  if (buffer.length < overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${overhead} for encryption v${version}` });
  }

  let pos = 1;

  const sessionId = buffer.subarray(pos, pos + tcrypto.SESSION_ID_SIZE);
  pos += tcrypto.SESSION_ID_SIZE;

  const seed = buffer.subarray(pos, pos + tcrypto.SESSION_SEED_SIZE);
  pos += tcrypto.SESSION_SEED_SIZE;

  const encryptedData = buffer.subarray(pos);

  return { encryptedData, sessionId, resourceId: seed };
};

const decrypt = async (version: Version, keyMapper: KeyMapper, data: EncryptionData): Promise<Uint8Array> => {
  const key = await getKeyFromCompositeResourceId(data, keyMapper);

  const associatedData = utils.concatArrays(Uint8Array.from([version]), data.sessionId, data.resourceId);
  const iv = formatIV(data.sessionId);
  const resourceId = serializeCompositeResourceId(data);
  return tryDecryptAEAD(resourceId, key, iv, data.encryptedData, associatedData);
};

const decryptChunk = (version: StreamVersion, key: Uint8Array, index: number, headerData: StreamHeaderData, data: Uint8Array): Uint8Array => {
  const ivSeed = formatIV(headerData.sessionId);
  const iv = tcrypto.deriveIV(ivSeed, index);

  const associatedData = serializeStreamHeader(version, headerData);
  const resourceId = serializeCompositeResourceId(headerData);
  return tryDecryptAEAD(resourceId, key, iv, data, associatedData);
};

const extractResourceId = (version: Version, overhead: number, buffer: Uint8Array): Uint8Array => {
  const data = unserialize(version, overhead, buffer);
  return serializeCompositeResourceId(data);
};

const extractStreamResourceId = (version: StreamVersion, overhead: number, buffer: Uint8Array): Uint8Array => {
  const data = unserializeStreamHeader(version, overhead, buffer);
  return serializeCompositeResourceId(data);
};

export class EncryptionV9 {
  static version = 9 as const;

  static features = {
    chunks: false,
    fixedResourceId: true,
    padding: false,
  } as const;

  /*
    | Name           | size  |
    | Version        | 1     |
    | Session ID     | 16    |
    | Resource ID    | 16    |
    | Encrypted Data |       |
    | MAC            | 16    |
  */
  static overhead = 1 + tcrypto.SESSION_ID_SIZE + tcrypto.SESSION_SEED_SIZE + tcrypto.MAC_SIZE;

  static getClearSize = (encryptedSize: number) => encryptedSize - this.overhead;

  static getEncryptedSize = (clearSize: number) => clearSize + this.overhead;

  static unserialize = unserialize.bind(this, this.version, this.overhead);

  static serialize = serialize.bind(this, this.version);

  static encrypt = encrypt.bind(this, this.version);

  static decrypt = decrypt.bind(this, this.version);

  static extractResourceId = extractResourceId.bind(this, this.version, this.overhead);

  static deriveSessionKey = deriveSessionKey;
}

export class EncryptionV10 {
  static version = 10 as const;

  static features = {
    chunks: false,
    fixedResourceId: true,
    padding: true,
  } as const;

  /*
    | Name           | size  |
    | Version        | 1     |
    | Session ID     | 16    |
    | Resource ID    | 16    |
    | Encrypted Data |       |
    | MAC            | 16    |
    + 1 mandatory padding byte (0x80)
  */
  static overhead = 1 + tcrypto.SESSION_ID_SIZE + tcrypto.SESSION_SEED_SIZE + tcrypto.MAC_SIZE + 1;

  static getClearSize = (encryptedSize: number) => encryptedSize - this.overhead;

  // -1 is the padding byte (0x80) already accounted for by `paddedFromClearSize()`
  static getEncryptedSize = (clearSize: number, paddingStep?: number | Padding) => paddedFromClearSize(clearSize, paddingStep) + this.overhead - 1;

  static unserialize = unserialize.bind(this, this.version, this.overhead);

  static serialize = serialize.bind(this, this.version);

  static encrypt = (sessionKey: Uint8Array, plaintext: Uint8Array, sessionId: Uint8Array, paddingStep?: number | Padding): EncryptionData => {
    const paddedData = padClearData(plaintext, paddingStep);
    return encrypt(this.version, sessionKey, paddedData, sessionId);
  };

  static decrypt = async (keyMapper: KeyMapper, data: EncryptionData): Promise<Uint8Array> => {
    const paddedData = await decrypt(this.version, keyMapper, data);
    return removePadding(paddedData);
  };

  static extractResourceId = extractResourceId.bind(this, this.version, this.overhead);

  static deriveSessionKey = deriveSessionKey;
}

export class EncryptionV11 {
  static version = 11 as const;

  static features = {
    chunks: true,
    fixedResourceId: true,
    padding: true,
  } as const;

  /*
    | Name        | size  |
    | Version     | 1     |
    | Session ID  | 16    |
    | Resource ID | 16    |
    | Chunk size  | 4     |
  */
  static overhead = 1 + tcrypto.SESSION_ID_SIZE + tcrypto.SESSION_SEED_SIZE + number.uint32ByteSize;

  /*
    | Name         | size |
    | Padding size | 4    |
    | MAC          | 16   |
  */
  static chunkOverhead = number.uint32ByteSize + tcrypto.MAC_SIZE;

  static defaultMaxEncryptedChunkSize = 1024 * 1024; // 1MB

  static getClearSize = (encryptedSize: number, maxEncryptedChunkSize: number = this.defaultMaxEncryptedChunkSize) => {
    const chunkCount = Math.ceil((encryptedSize - this.overhead) / maxEncryptedChunkSize);
    return encryptedSize - this.overhead - chunkCount * this.chunkOverhead;
  };

  static getEncryptedSize = (clearSize: number, padding?: number | Padding, maxEncryptedChunkSize: number = this.defaultMaxEncryptedChunkSize) => {
    // -1 is the padding byte (0x80) already accounted for by `paddedFromClearSize()`
    const paddedSize = paddedFromClearSize(clearSize, padding) - 1;
    const maxClearChunkSize = maxEncryptedChunkSize - this.chunkOverhead;
    // Note: if clearSize is multiple of maxClearChunkSize, an additional empty chunk is added
    //       at the end, hence the +1 to compute chunkCount
    const chunkCount = Math.ceil((paddedSize + 1) / maxClearChunkSize);
    return this.overhead + paddedSize + chunkCount * this.chunkOverhead;
  };

  static unserializeHeader = unserializeStreamHeader.bind(this, this.version, this.overhead);

  static serializeHeader = serializeStreamHeader.bind(this, this.version);

  static encryptChunk = encryptChunk.bind(this, this.version);

  static decryptChunk = decryptChunk.bind(this, this.version);

  static extractResourceId = extractStreamResourceId.bind(this, this.version, this.overhead);

  static deriveSessionKey = deriveSessionKey;
}
