// @flow

import { type DataStore, mergeSchemas } from '@tanker/datastore-base';

import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';

import UserStore from '../Users/UserStore';
import Generator, { makeGenerator } from './Generator';
import { type UnverifiedEntry } from '../Blocks/entries';
import { type VerifiedDeviceCreation } from '../UnverifiedStore/UserUnverifiedStore';
import makeUint8Array from './makeUint8Array';

export async function makeMemoryDataStore(): Promise<DataStore<*>> {
  const schemas = mergeSchemas(UserStore.schemas);

  const baseConfig = { ...dataStoreConfig, schemas };
  const config = { ...baseConfig, dbName: `user-store-test-${makePrefix()}` };
  return openDataStore(config);
}

export function forgeVerifiedEntry(entry: UnverifiedEntry): VerifiedDeviceCreation {
  const anyEntry: VerifiedDeviceCreation = {
    ...entry,
    ...entry.payload_unverified,
  };
  return anyEntry;
}

export default class UserStoreBuilder {
  generator: Generator;
  userStore: UserStore;

  constructor(userStore: UserStore, generator: Generator) {
    this.generator = generator;
    this.userStore = userStore;
  }

  static async open() {
    const { generator } = await makeGenerator();
    const dataStore = await makeMemoryDataStore();
    const userStore = new UserStore(dataStore);
    userStore.setLocalUser(({ userId: makeUint8Array('userID', 32), applyDeviceCreation: () => {} }: any));
    return new UserStoreBuilder(userStore, generator);
  }

  async newUserCreationV1(userId: string) {
    const result = await this.generator.newUserCreationV1(userId);
    await this.userStore.applyEntry(forgeVerifiedEntry(result.entry));

    return result;
  }

  async newUserCreationV3(userId: string) {
    const result = await this.generator.newUserCreationV3(userId);
    await this.userStore.applyEntry(forgeVerifiedEntry(result.entry));

    return result;
  }
}

export async function makeUserStoreBuilder(): Promise<any> {
  const builder = await UserStoreBuilder.open();
  return {
    builder,
    generator: builder.generator,
    userStore: builder.userStore,
  };
}
