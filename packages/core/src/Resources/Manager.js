// @flow
import { type Key } from '@tanker/crypto';

import { getKeyPublishEntryFromBlock } from './Serialize';
import { KeyDecryptor } from './KeyDecryptor';

import { Client } from '../Network/Client';
import ResourceStore from './ResourceStore';
import LocalUserManager from '../LocalUser/Manager';
import GroupManager from '../Groups/Manager';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';

export class ResourceManager {
  _resourceStore: ResourceStore;
  _client: Client;
  _keyDecryptor: KeyDecryptor;

  constructor(
    client: Client,
    resourceStore: ResourceStore,
    localUserManager: LocalUserManager,
    groupManager: GroupManager,
    provisionalIdentityManager: ProvisionalIdentityManager
  ) {
    this._resourceStore = resourceStore;
    this._client = client;
    this._keyDecryptor = new KeyDecryptor(localUserManager, groupManager, provisionalIdentityManager);
  }

  async findKeyFromResourceId(resourceId: Uint8Array): Promise<Key> {
    let resourceKey = await this._resourceStore.findResourceKey(resourceId);
    if (!resourceKey) {
      const keyPublishBlock = await this._client.getResourceKey(resourceId);
      const keyPublish = getKeyPublishEntryFromBlock(keyPublishBlock);
      resourceKey = await this._keyDecryptor.keyFromKeyPublish(keyPublish);
      await this._resourceStore.saveResourceKey(resourceId, resourceKey);
    }
    return resourceKey;
  }

  saveResourceKey = (resourceId: Uint8Array, key: Uint8Array): Promise<void> => this._resourceStore.saveResourceKey(resourceId, key)
}

export default ResourceManager;
