// @flow

import { type DataStore, mergeSchemas } from '@tanker/datastore-base';
import { createUserSecretBinary } from '@tanker/crypto';

import dataStoreConfig, { makePrefix, openDataStore } from './dataStoreConfig';

import GroupStore from '../Groups/GroupStore';
import Generator, { makeGenerator, type GeneratorDevice, type GeneratorUserGroupResult } from './Generator';
import { type Entry, type UnverifiedEntry } from '../Blocks/entries';

export async function makeMemoryDataStore(): Promise<DataStore<*>> {
  const schemas = mergeSchemas(GroupStore.schemas);

  const baseConfig = { ...dataStoreConfig, schemas };
  const config = { ...baseConfig, dbName: `group-store-test-${makePrefix()}` };
  return openDataStore(config);
}

export function forgeVerifiedEntry(entry: UnverifiedEntry): Entry {
  const anyEntry: Object = { ...entry };
  anyEntry.payload_verified = anyEntry.payload_unverified;
  delete anyEntry.payload_unverified;
  const verifiedEntry: Entry = anyEntry;
  return verifiedEntry;
}

export default class GroupStoreBuilder {
  generator: Generator;
  groupStore: GroupStore;

  constructor(groupStore: GroupStore, generator: Generator) {
    this.generator = generator;
    this.groupStore = groupStore;
  }

  static async open() {
    const { generator } = await makeGenerator();
    const dataStore = await makeMemoryDataStore();
    const userSecret = createUserSecretBinary('trustchainid', 'userId');
    const groupStore = await GroupStore.open(dataStore, userSecret);

    return new GroupStoreBuilder(groupStore, generator);
  }

  async newUserGroupCreation(from: GeneratorDevice, userIds: Array<string>) {
    const result = await this.generator.newUserGroupCreation(from, userIds);
    await this.groupStore.put({
      groupId: result.groupSignatureKeyPair.publicKey,
      signatureKeyPair: {
        publicKey: result.groupSignatureKeyPair.publicKey,
        privateKey: result.groupSignatureKeyPair.privateKey,
      },
      encryptionKeyPair: {
        publicKey: result.groupEncryptionKeyPair.publicKey,
        privateKey: result.groupEncryptionKeyPair.privateKey,
      },
      lastGroupBlock: result.entry.hash,
      index: result.entry.index,
    });

    return result;
  }

  async applyUserGroupCreation(group: GeneratorUserGroupResult) {
    await this.groupStore.put({
      groupId: group.groupSignatureKeyPair.publicKey,
      signatureKeyPair: {
        publicKey: group.groupSignatureKeyPair.publicKey,
        privateKey: group.groupSignatureKeyPair.privateKey,
      },
      encryptionKeyPair: {
        publicKey: group.groupEncryptionKeyPair.publicKey,
        privateKey: group.groupEncryptionKeyPair.privateKey,
      },
      lastGroupBlock: group.entry.hash,
      index: group.entry.index,
    });
  }
}

export async function makeGroupStoreBuilder(): Promise<any> {
  const builder = await GroupStoreBuilder.open();
  return {
    builder,
    generator: builder.generator,
    groupStore: builder.groupStore,
  };
}

