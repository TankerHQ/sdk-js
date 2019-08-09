// @flow
import { tcrypto, random, generichash, utils, type Key } from '@tanker/crypto';

import { InvalidArgument, InternalError } from '../../errors';
import { encryptData, extractResourceId } from '../Encryptor';
import { KeyDecryptor } from './KeyDecryptor';

import { Client } from '../../Network/Client';

import ResourceStore from './ResourceStore';
import { newKeyPublish } from './keyPublish';

export const currentStreamVersion = 4;

export const isSimpleVersion = (version: number) => version > 0 && version < 4;

export type ResourceMeta = $Exact<{
  key: Uint8Array,
  resourceId: Uint8Array,
}>;

export type Resource = $Exact<{ ...ResourceMeta, encryptedData: Uint8Array }>;

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
      throw new InternalError('Invalid response from server');
    }
    if (response.length === 0) {
      throw new InvalidArgument(`could not find key for resource: ${utils.toBase64(resourceId)}`);
    }
    return newKeyPublish(response[0]);
  };

  saveResourceKey = async (resourceId: Uint8Array, key: Uint8Array): Promise<void> => this._resourceStore.saveResourceKey(resourceId, key)
}
