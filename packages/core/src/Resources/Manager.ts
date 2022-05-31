import type { Key, b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';

import { getKeyPublishEntryFromBlock } from './Serialize';
import { KeyDecryptor } from './KeyDecryptor';
import { TaskCoalescer } from '../TaskCoalescer';

import type { Client } from '../Network/Client';
import type ResourceStore from './ResourceStore';
import type LocalUserManager from '../LocalUser/Manager';
import type GroupManager from '../Groups/Manager';
import type ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';

export type KeyResult = {
  id: b64string;
  key: Key;
};

export class ResourceManager {
  declare _client: Client;
  declare _keyDecryptor: KeyDecryptor;
  declare _keyLookupsInProgress: TaskCoalescer<KeyResult>;
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
    this._keyLookupsInProgress = new TaskCoalescer();
    this._resourceStore = resourceStore;
  }

  async findKeyFromResourceId(resourceId: Uint8Array): Promise<Key> {
    const b64resourceId = utils.toBase64(resourceId);

    const result = await this._keyLookupsInProgress.run(this._findKeysFromResourceIds, [b64resourceId]);
    return result[0]!.key;
  }

  _findKeysFromResourceIds = (b64resourceIds: Array<b64string>): Promise<Array<KeyResult>> => Promise.all(b64resourceIds.map(async (b64resourceId) => {
    const resourceId = utils.fromBase64(b64resourceId);
    let resourceKey = await this._resourceStore.findResourceKey(resourceId);

    if (!resourceKey) {
      const keyPublishBlock = await this._client.getResourceKey(resourceId);
      const keyPublish = getKeyPublishEntryFromBlock(keyPublishBlock);
      resourceKey = await this._keyDecryptor.keyFromKeyPublish(keyPublish);
      await this._resourceStore.saveResourceKey(resourceId, resourceKey);
    }

    return { id: b64resourceId, key: resourceKey };
  }));

  saveResourceKey = (resourceId: Uint8Array, key: Uint8Array): Promise<void> => this._resourceStore.saveResourceKey(resourceId, key);
}

export default ResourceManager;
