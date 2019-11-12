// @flow
import { type DataStore, type TableSchema } from '@tanker/datastore-base';

import type {
  UnverifiedDeviceCreation, VerifiedDeviceCreation,
  UnverifiedDeviceRevocation, VerifiedDeviceRevocation,
  UnverifiedProvisionalIdentityClaim, VerifiedProvisionalIdentityClaim,
} from '../../Blocks/entries';
import ProvisionalIdentityClaimUnverifiedStore from './ProvisionalIdentityClaimUnverifiedStore';
import UserUnverifiedStore from './UserUnverifiedStore';

const schemaTablesV3 = [
  {
    name: 'unverified_key_publishes',
    indexes: [['resourceId'], ['nature']]
  }
];

const schemaTablesV4 = [
  ...schemaTablesV3,
  ...UserUnverifiedStore.tables,
  // Legacy tables from now removed UserGroupsUnverifiedStore:
  {
    name: 'unverified_user_groups',
    indexes: [['index'], ['group_id']]
  }, {
    name: 'encryption_key_to_group_id',
  }
];

const schemaTablesV6 = [
  ...schemaTablesV4,
  ...ProvisionalIdentityClaimUnverifiedStore.tables,
];

const schemaTablesV8 = schemaTablesV6.map<TableSchema>(def => {
  const deleted = ['unverified_user_groups', 'encryption_key_to_group_id'].indexOf(def.name) !== -1;
  return deleted ? ({ ...def, deleted: true }) : def;
});

// Storage for unverified blocks of different natures
export default class UnverifiedStore {
  userUnverifiedStore: UserUnverifiedStore;
  provisionalIdentityClaimUnverifiedStore: ProvisionalIdentityClaimUnverifiedStore;

  static schemas = [
    {
      version: 1,
      tables: [],
    },
    {
      version: 2,
      tables: [],
    },
    {
      version: 3,
      tables: schemaTablesV3,
    },
    {
      version: 4,
      tables: schemaTablesV4,
    },
    {
      version: 5,
      tables: schemaTablesV4,
    },
    {
      version: 6,
      tables: schemaTablesV6,
    },
    {
      version: 7,
      tables: schemaTablesV6,
    },
    {
      version: 8,
      tables: schemaTablesV8,
    },
  ];

  static async open(ds: DataStore<*>): Promise<UnverifiedStore> {
    const store = new UnverifiedStore();
    store.userUnverifiedStore = await UserUnverifiedStore.open(ds);
    store.provisionalIdentityClaimUnverifiedStore = await ProvisionalIdentityClaimUnverifiedStore.open(ds);
    return store;
  }

  async close(): Promise<void> {
    await this.userUnverifiedStore.close();
    await this.provisionalIdentityClaimUnverifiedStore.close();
  }

  async addUnverifiedUserEntries(entries: Array<UnverifiedDeviceCreation | UnverifiedDeviceRevocation>): Promise<void> {
    return this.userUnverifiedStore.addUnverifiedUserEntries(entries);
  }

  async findUnverifiedDeviceByHash(deviceId: Uint8Array): Promise<?UnverifiedDeviceCreation> {
    const results = await this.userUnverifiedStore.findUnverifiedDevicesByHash([deviceId]);
    if (results.length !== 0)
      return results[0];
    return null;
  }

  async findUnverifiedDevicesByHash(deviceIds: Array<Uint8Array>): Promise<Array<UnverifiedDeviceCreation>> {
    return this.userUnverifiedStore.findUnverifiedDevicesByHash(deviceIds);
  }

  async findUnverifiedDeviceRevocationByHash(hash: Uint8Array): Promise<?UnverifiedDeviceRevocation> {
    return this.userUnverifiedStore.findUnverifiedDeviceRevocationByHash(hash);
  }

  async findUnverifiedUserEntries(userIds: Array<Uint8Array>, stopBeforeIndex?: number): Promise<Array<UnverifiedDeviceCreation | UnverifiedDeviceRevocation>> {
    return this.userUnverifiedStore.findUnverifiedUserEntries(userIds, stopBeforeIndex);
  }

  async removeVerifiedUserEntries(entries: $ReadOnlyArray<VerifiedDeviceCreation | VerifiedDeviceRevocation>): Promise<void> {
    return this.userUnverifiedStore.removeVerifiedUserEntries(entries);
  }

  async getUserIdFromDeviceId(deviceId: Uint8Array) {
    return this.userUnverifiedStore.getUserIdFromDeviceId(deviceId);
  }

  async addUnverifiedProvisionalIdentityClaimEntries(entries: Array<UnverifiedProvisionalIdentityClaim>): Promise<void> {
    return this.provisionalIdentityClaimUnverifiedStore.addUnverifiedProvisionalIdentityClaimEntries(entries);
  }

  async removeVerifiedProvisionalIdentityClaimEntries(entries: Array<VerifiedProvisionalIdentityClaim>): Promise<void> {
    return this.provisionalIdentityClaimUnverifiedStore.removeVerifiedProvisionalIdentityClaimEntries(entries);
  }

  async findUnverifiedProvisionalIdentityClaims(userId: Uint8Array): Promise<Array<UnverifiedProvisionalIdentityClaim>> {
    return this.provisionalIdentityClaimUnverifiedStore.findUnverifiedProvisionalIdentityClaims(userId);
  }
}
