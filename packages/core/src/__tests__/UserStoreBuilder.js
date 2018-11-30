// @flow

import { type DataStore, mergeSchemas } from '@tanker/datastore-base';

import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';

import UserStore from '../Users/UserStore';
import Generator, { makeGenerator } from './Generator';
import makeUint8Array from './makeUint8Array';

import { deviceCreationFromBlock } from '../Blocks/entries';

export async function makeMemoryDataStore(): Promise<DataStore<*>> {
  const schemas = mergeSchemas(UserStore.schemas);

  const baseConfig = { ...dataStoreConfig, schemas };
  const config = { ...baseConfig, dbName: `user-store-test-${makePrefix()}` };
  return openDataStore(config);
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

  async newUserCreationV3(userId: string) {
    const result = await this.generator.newUserCreationV3(userId);
    await this.userStore.applyEntry(deviceCreationFromBlock(result.block));

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
