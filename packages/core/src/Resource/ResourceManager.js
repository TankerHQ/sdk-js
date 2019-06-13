// @flow
import varint from 'varint';
import { tcrypto, random, generichash, number, utils, type Key } from '@tanker/crypto';

import { DecryptionFailed, InvalidArgument, NotEnoughData, ResourceNotFound } from '../errors';
import type { VerifiedKeyPublish } from '../Blocks/entries';
import { getEncryptionFormat, encryptData, extractResourceId } from '../DataProtection/Encryptor';
import Trustchain from '../Trustchain/Trustchain';
import { KeyDecryptor } from './KeyDecryptor';
import ResourceStore from './ResourceStore';

export const currentStreamVersion = 4;

export const isSimpleVersion = (version: number) => version > 0 && version < 4;

export type ResourceMeta = $Exact<{
  key: Uint8Array,
  resourceId: Uint8Array,
}>;

export type Resource = $Exact<{ ...ResourceMeta, encryptedData: Uint8Array }>;

export type HeaderV4 = {
  version: 4,
  resourceId: Uint8Array,
  encryptedChunkSize: number,
  byteLength?: number,
};

export const extractHeaderV4 = (encryptedData: Uint8Array): { data: Uint8Array, header: HeaderV4 } => {
  const { version, versionLength } = getEncryptionFormat(encryptedData);

  if (version !== 4)
    throw new DecryptionFailed({ message: `unhandled format version in extractHeaderV4: '${version}'` });

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
  return utils.concatArrays(new Uint8Array(version), encryptedChunkSize, resourceId);
};

export function getResourceId(encryptedData: Uint8Array): Uint8Array {
  const { version, versionLength } = getEncryptionFormat(encryptedData);
  const minEncryptedDataLength = versionLength + tcrypto.MAC_SIZE;

  if (encryptedData.length < minEncryptedDataLength)
    throw new InvalidArgument('encryptedData', `Uint8Array(${minEncryptedDataLength}+)`, encryptedData);

  if (isSimpleVersion(version)) {
    return extractResourceId(encryptedData);
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

  makeSimpleResource(plain: Uint8Array): Resource {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const encryptedData = encryptData(key, plain);
    const resourceId = extractResourceId(encryptedData);
    return { key, resourceId, encryptedData };
  }

  makeStreamResource(): ResourceMeta {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = generichash(key, tcrypto.MAC_SIZE);

    return { key, resourceId };
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
