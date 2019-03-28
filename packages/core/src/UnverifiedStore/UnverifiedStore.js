// @flow
import { type DataStore } from '@tanker/datastore-base';

import KeyPublishUnverifiedStore, { type UnverifiedKeyPublish } from './KeyPublishUnverifiedStore';
import UserUnverifiedStore, { type UnverifiedDeviceCreation, type VerifiedDeviceCreation, type UnverifiedDeviceRevocation, type VerifiedDeviceRevocation } from './UserUnverifiedStore';
import UserGroupsUnverifiedStore, { type UnverifiedUserGroup, type VerifiedUserGroup } from './UserGroupsUnverifiedStore';

const schemaTablesV3 = [
  ...KeyPublishUnverifiedStore.tables,
];

const schemaTablesV4 = [
  ...schemaTablesV3,
  ...UserUnverifiedStore.tables,
  ...UserGroupsUnverifiedStore.tables,
];

// Storage for unverified blocks of different natures
export default class UnverifiedStore {
  keyPublishUnverifiedStore: KeyPublishUnverifiedStore;
  userUnverifiedStore: UserUnverifiedStore;
  userGroupsUnverifiedStore: UserGroupsUnverifiedStore;

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
  ];

  static async open(ds: DataStore<*>): Promise<UnverifiedStore> {
    const store = new UnverifiedStore();
    store.keyPublishUnverifiedStore = await KeyPublishUnverifiedStore.open(ds);
    store.userUnverifiedStore = await UserUnverifiedStore.open(ds);
    store.userGroupsUnverifiedStore = await UserGroupsUnverifiedStore.open(ds);
    return store;
  }

  async close(): Promise<void> {
    await this.keyPublishUnverifiedStore.close();
    await this.userUnverifiedStore.close();
    await this.userGroupsUnverifiedStore.close();
  }

  async addUnverifiedKeyPublishes(entries: Array<UnverifiedKeyPublish>) {
    return this.keyPublishUnverifiedStore.addUnverifiedKeyPublishes(entries);
  }

  async findUnverifiedKeyPublish(resourceId: Uint8Array): Promise<?UnverifiedKeyPublish> {
    return this.keyPublishUnverifiedStore.findUnverifiedKeyPublish(resourceId);
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

  async addUnverifiedUserGroups(entries: Array<UnverifiedUserGroup>): Promise<void> {
    return this.userGroupsUnverifiedStore.addUnverifiedUserGroupEntries(entries);
  }

  async findUnverifiedUserGroup(groupId: Uint8Array): Promise<Array<UnverifiedUserGroup>> {
    return this.userGroupsUnverifiedStore.findUnverifiedUserGroup(groupId);
  }

  async findUnverifiedUserGroupByPublicEncryptionKey(pubEncKey: Uint8Array): Promise<Array<UnverifiedUserGroup>> {
    return this.userGroupsUnverifiedStore.findUnverifiedUserGroupByPublicEncryptionKey(pubEncKey);
  }

  async removeVerifiedUserGroupEntry(userGroup: VerifiedUserGroup): Promise<void> {
    return this.userGroupsUnverifiedStore.removeVerifiedUserGroupEntry(userGroup);
  }

  async getUserIdFromDeviceId(deviceId: Uint8Array) {
    return this.userUnverifiedStore.getUserIdFromDeviceId(deviceId);
  }
}
