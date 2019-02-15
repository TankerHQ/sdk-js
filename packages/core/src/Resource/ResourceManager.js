// @flow

import varint from 'varint';

import { tcrypto, random, aead, generichash, number, type Key } from '@tanker/crypto';
import { ResourceNotFound, InvalidEncryptionFormat, InvalidArgument, NotEnoughData } from '../errors';
import { concatArrays } from '../Blocks/Serialize';
import Trustchain from '../Trustchain/Trustchain';
import { type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import { KeyDecryptor } from './KeyDecryptor';
import ResourceStore from './ResourceStore';

export const currentSimpleVersion = 3;
export const currentStreamVersion = 4;
export const isValidVersion = (version: number) => version > 0 && version <= 4;
export const isSimpleVersion = (version: number) => version > 0 && version < 4;

export type Resource = {
  key: Uint8Array,
  resourceId: Uint8Array,
  encryptedData: Uint8Array,
  version: number
}

export type HeaderV4 = {
  version: 4,
  resourceId: Uint8Array,
  encryptedChunkSize: number,
  byteLength?: number,
};

export type ResourceIdKeyPair = {
  key: Uint8Array,
  resourceId: Uint8Array
}

export function getEncryptionFormat(encryptedData: Uint8Array): { version: number, versionLength: number } {
  let version;
  let versionLength;

  try {
    version = varint.decode(encryptedData);
    versionLength = varint.decode.bytes;
  } catch (err) {
    if (err instanceof RangeError) {
      throw new InvalidEncryptionFormat('invalid format version in getResourceId (bad varint)');
    } else {
      throw err;
    }
  }

  if (!isValidVersion(version))
    throw new InvalidEncryptionFormat(`unhandled format version in getResourceId: '${version}'`);

  return { version, versionLength };
}

export const extractHeaderV4 = (encryptedData: Uint8Array): { data: Uint8Array, header: HeaderV4 } => {
  const { version, versionLength } = getEncryptionFormat(encryptedData);

  if (version !== 4)
    throw new InvalidEncryptionFormat(`unhandled format version in extractHeaderV4: '${version}'`);

  const uint32Length = 4;

  if (encryptedData.length < versionLength + uint32Length + tcrypto.MAC_SIZE)
    throw new NotEnoughData('data is not long enough to extract the encryption header');

  let pos = versionLength;

  const encryptedChunkSize = number.fromUint32le(encryptedData.subarray(pos, pos + uint32Length));
  pos += uint32Length;

  const resourceId = encryptedData.subarray(pos, pos + tcrypto.MAC_SIZE);
  pos += tcrypto.MAC_SIZE;

  const header = {
    version,
    encryptedChunkSize,
    resourceId,
    byteLength: pos,
  };

  const data = encryptedData.subarray(pos);

  return { data, header };
};

export const serializeHeaderV4 = (header: HeaderV4): Uint8Array => {
  const version = varint.encode(header.version);
  const encryptedChunkSize = number.toUint32le(header.encryptedChunkSize);
  const resourceId = header.resourceId;
  return concatArrays(version, encryptedChunkSize, resourceId);
};

const extractSimpleResourceId = (ciphertext: Uint8Array): Uint8Array => aead.extractMac(ciphertext);

export function getResourceId(encryptedData: Uint8Array): Uint8Array {
  const { version, versionLength } = getEncryptionFormat(encryptedData);
  const minEncryptedDataLength = versionLength + tcrypto.MAC_SIZE;

  if (encryptedData.length < minEncryptedDataLength)
    throw new InvalidArgument('encryptedData', `Uint8Array(${minEncryptedDataLength}+)`, encryptedData);

  if (isSimpleVersion(version)) {
    const subData = encryptedData.subarray(versionLength);
    return extractSimpleResourceId(subData);
  }

  let resourceId;

  try {
    ({ header: { resourceId } } = extractHeaderV4(encryptedData));
  } catch (err) {
    throw new InvalidArgument('encryptedData', 'Uint8Array with properly formatted v4 header', encryptedData);
  }

  return resourceId;
}

export class ResourceManager {
  _resourceStore: ResourceStore;
  _trustchain: Trustchain;
  _keyDecryptor: KeyDecryptor;

  constructor(
    resourceStore: ResourceStore,
    trustchain: Trustchain,
    keyDecryptor: KeyDecryptor
  ) {
    this._resourceStore = resourceStore;
    this._trustchain = trustchain;
    this._keyDecryptor = keyDecryptor;
  }

  static async makeSimpleResource(plain: Uint8Array): Promise<Resource> {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const buffer = await aead.encryptAEADv3(key, plain);
    const resourceId = extractSimpleResourceId(buffer);
    return { key, resourceId, encryptedData: buffer, version: currentSimpleVersion };
  }

  static makeStreamResource(): ResourceIdKeyPair {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = generichash(key, tcrypto.MAC_SIZE);

    return { key, resourceId, version: currentStreamVersion };
  }

  async findKeyFromResourceId(resourceId: Uint8Array, retry?: bool): Promise<Key> {
    const key = await this._resourceStore.findResourceKey(resourceId);
    if (key)
      return key;
    const keyPublishEntry = await this._trustchain.findKeyPublish(resourceId);
    if (keyPublishEntry) {
      const processedKey = await this.extractAndSaveResourceKey(keyPublishEntry);
      if (processedKey) {
        return processedKey;
      }
    } else if (retry) {
      await this._trustchain.sync();
      return this.findKeyFromResourceId(resourceId);
    }
    throw new ResourceNotFound(resourceId);
  }

  async extractAndSaveResourceKey(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    // ignore this block, our device doesn't exist yet so there's no way this resourceKey publish is for us
    if (!this._keyDecryptor.deviceReady())
      return null;

    const resourceKey = await this._keyDecryptor.keyFromKeyPublish(keyPublishEntry);
    if (resourceKey) {
      await this.saveResourceKey(keyPublishEntry.resourceId, resourceKey);
    }

    return resourceKey;
  }

  async saveResourceKey(resourceId: Uint8Array, key: Uint8Array): Promise<void> {
    return this._resourceStore.saveResourceKey(resourceId, key);
  }
}
