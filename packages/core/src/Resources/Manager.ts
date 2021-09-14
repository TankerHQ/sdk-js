import type { Key, b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';

import { getKeyPublishEntryFromBlock } from './Serialize';
import { KeyDecryptor } from './KeyDecryptor';

import type { Client } from '../Network/Client';
import type ResourceStore from './ResourceStore';
import type LocalUserManager from '../LocalUser/Manager';
import type GroupManager from '../Groups/Manager';
import type ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';

export class ResourceManager {
  declare _client: Client;
  declare _keyDecryptor: KeyDecryptor;
  declare _keyLookupsInProgress: Record<b64string, Promise<Key>>;
  declare _resourceStore: ResourceStore;

  constructor(
    client: Client,
    resourceStore: ResourceStore,
    localUserManager: LocalUserManager,
    groupManager: GroupManager,
    provisionalIdentityManager: ProvisionalIdentityManager,
  ) {
    this._client = client;
    this._keyDecryptor = new KeyDecryptor(localUserManager, groupManager, provisionalIdentityManager);
    this._keyLookupsInProgress = {};
    this._resourceStore = resourceStore;
  }

  async findKeyFromResourceId(resourceId: Uint8Array): Promise<Key> {
    const b64resourceId = utils.toBase64(resourceId);

    if (!this._keyLookupsInProgress[b64resourceId]) {
      this._keyLookupsInProgress[b64resourceId] = this._findKeyFromResourceId(resourceId).finally(() => {
        delete this._keyLookupsInProgress[b64resourceId];
      });
    }

    return this._keyLookupsInProgress[b64resourceId]!;
  }

  async _findKeyFromResourceId(resourceId: Uint8Array): Promise<Key> {
    let resourceKey = await this._resourceStore.findResourceKey(resourceId);

    if (!resourceKey) {
      const keyPublishBlock = await this._client.getResourceKey(resourceId);
      const keyPublish = getKeyPublishEntryFromBlock(keyPublishBlock);
      resourceKey = await this._keyDecryptor.keyFromKeyPublish(keyPublish);
      await this._resourceStore.saveResourceKey(resourceId, resourceKey);
    }

    return resourceKey;
  }

  saveResourceKey = (resourceId: Uint8Array, key: Uint8Array): Promise<void> => this._resourceStore.saveResourceKey(resourceId, key);
}

export default ResourceManager;
