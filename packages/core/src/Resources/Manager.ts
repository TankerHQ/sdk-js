import type { Key, b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';
import { UpgradeRequired } from '@tanker/errors';
import { errors as dbErrors } from '@tanker/datastore-base';

import { getKeyPublishEntryFromBlock } from './Serialize';
import { KeyDecryptor } from './KeyDecryptor';
import { TaskCoalescer } from '../TaskCoalescer';

import type { Client } from '../Network/Client';
import type { ResourceStore } from './ResourceStore';
import type { LocalUserManager } from '../LocalUser/Manager';
import type { GroupManager } from '../Groups/Manager';
import type { ProvisionalIdentityManager } from '../ProvisionalIdentity/Manager';
import { SentryLimiter } from '../SentryLimiter';

export type KeyResult = {
  id: b64string;
  key: Key | null;
};

export class ResourceManager {
  declare _client: Client;
  declare _keyDecryptor: KeyDecryptor;
  declare _keyLookupCoalescer: TaskCoalescer<KeyResult>;
  declare _resourceStore: ResourceStore;
  declare _sentry: SentryLimiter | null;

  constructor(
    client: Client,
    resourceStore: ResourceStore,
    localUserManager: LocalUserManager,
    groupManager: GroupManager,
    provisionalIdentityManager: ProvisionalIdentityManager,
    sentry: SentryLimiter | null,
  ) {
    this._client = client;
    this._keyDecryptor = new KeyDecryptor(localUserManager, groupManager, provisionalIdentityManager);
    this._keyLookupCoalescer = new TaskCoalescer();
    this._resourceStore = resourceStore;
    this._sentry = sentry;
  }

  async findKeyFromResourceId(resourceId: Uint8Array): Promise<Key | null> {
    const b64resourceId = utils.toBase64(resourceId);

    const result = await this._keyLookupCoalescer.run(this._findKeysFromResourceIds, [b64resourceId]);
    return result[0]!.key;
  }

  _findKeysFromResourceIds = (b64resourceIds: Array<b64string>): Promise<Array<KeyResult>> => Promise.all(b64resourceIds.map(async (b64resourceId) => {
    const resourceId = utils.fromBase64(b64resourceId);
    try {
      let resourceKey = await this._resourceStore.findResourceKey(resourceId);

      if (!resourceKey) {
        const keyPublishBlock = await this._client.getResourceKey(resourceId);
        if (!keyPublishBlock) {
          this._sentry?.addBreadcrumb({
            category: 'tanker_keystore',
            level: 'warning',
            message: `Key not found in either cache or server for ${b64resourceId}`,
          });
          return { id: b64resourceId, key: null };
        }
        this._sentry?.addBreadcrumb({
          category: 'tanker_keystore',
          level: 'debug',
          message: `Tanker key not found in cache, but fetched from server for ${b64resourceId}`,
        });

        const keyPublish = getKeyPublishEntryFromBlock(keyPublishBlock);
        resourceKey = await this._keyDecryptor.keyFromKeyPublish(keyPublish);
        await this._resourceStore.saveResourceKey(resourceId, resourceKey);
      } else {
        this._sentry?.addBreadcrumb({
          category: 'tanker_keystore',
          level: 'debug',
          message: `Tanker key found in cache for ${b64resourceId}`,
        });
      }

      return { id: b64resourceId, key: resourceKey };
    } catch (e) {
      if (e instanceof dbErrors.VersionError) {
        throw new UpgradeRequired(e);
      }

      throw e;
    }
  }));

  saveResourceKey = (resourceId: Uint8Array, key: Uint8Array): Promise<void> => this._resourceStore.saveResourceKey(resourceId, key);
}
