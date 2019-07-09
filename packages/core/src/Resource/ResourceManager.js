// @flow
import varint from 'varint';
import { tcrypto, random, generichash, number, utils, type Key } from '@tanker/crypto';

import { DecryptionFailed, InvalidArgument } from '../errors';
import { getEncryptionFormat, encryptData, extractResourceId } from '../DataProtection/Encryptor';
import { KeyDecryptor } from './KeyDecryptor';

import { Client } from '../Network/Client';

import ResourceStore from './ResourceStore';
import { newKeyPublish } from './keyPublish';

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
  const minEncryptedDataLength = versionLength + uint32Length + tcrypto.MAC_SIZE;

  if (encryptedData.length < minEncryptedDataLength)
    throw new InvalidArgument('encryptedData', `Uint8Array(${minEncryptedDataLength}+)`, encryptedData);

  let data;
  let header;
  let pos = versionLength;

  try {
    const encryptedChunkSize = number.fromUint32le(encryptedData.subarray(pos, pos + uint32Length));
    pos += uint32Length;

    const resourceId = encryptedData.subarray(pos, pos + tcrypto.MAC_SIZE);
    pos += tcrypto.MAC_SIZE;

    header = {
      version,
      encryptedChunkSize,
      resourceId,
      byteLength: pos,
    };

    data = encryptedData.subarray(pos);
  } catch (e) {
    throw new InvalidArgument('encryptedData', 'Uint8Array with properly formatted v4 header', encryptedData);
  }

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

  const { header: { resourceId } } = extractHeaderV4(encryptedData);
  return resourceId;
}

export class ResourceManager {
  _resourceStore: ResourceStore;
  _client: Client;
  _keyDecryptor: KeyDecryptor;

  constructor(
    resourceStore: ResourceStore,
    client: Client,
    keyDecryptor: KeyDecryptor,
  ) {
    this._resourceStore = resourceStore;
    this._client = client;
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

  async findKeyFromResourceId(resourceId: Uint8Array): Promise<Key> {
    let resourceKey = await this._resourceStore.findResourceKey(resourceId);
    if (!resourceKey) {
      const keyPublish = await this._getKeyPublish(this._client, resourceId);
      resourceKey = await this._keyDecryptor.keyFromKeyPublish(keyPublish);
      await this._resourceStore.saveResourceKey(resourceId, resourceKey);
    }
    return resourceKey;
  }

  _getKeyPublish = async (client: Client, resourceId: Uint8Array) => {
    const response = await client.send('get key publishes', {
      resource_ids: [utils.toBase64(resourceId)],
    });
    if (!Array.isArray(response)) {
      throw new Error('Invalid response from server');
    }
    if (response.length === 0) {
      throw new InvalidArgument(`could not find key for resource: ${utils.toBase64(resourceId)}`);
    }
    return newKeyPublish(response[0]);
  };

  saveResourceKey = async (resourceId: Uint8Array, key: Uint8Array): Promise<void> => this._resourceStore.saveResourceKey(resourceId, key)
}
