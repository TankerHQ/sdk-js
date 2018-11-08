// @flow

import { mergeSchemas } from '@tanker/datastore-base';

import { expect } from './chai';
import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';

import Keystore from '../Session/Keystore';
import UserStore from '../Users/UserStore';
import TrustchainStore from '../Trustchain/TrustchainStore';

const schemas = mergeSchemas(
  Keystore.schemas,
  UserStore.schemas,
  TrustchainStore.schemas,
);

const baseConfig = { ...dataStoreConfig, schemas };

async function makeMemoryDataStore() {
  const config = { ...baseConfig, dbName: `trustchain-${makePrefix()}` };
  const dataStore = await openDataStore(config);
  return { dataStore, config };
}

describe('TrustchainStore', () => {
  const TABLE_METADATA = 'trustchain_metadata';
  const LAST_BLOCK_INDEX_KEY = 'lastBlockIndex';

  it('sets up a default lastBlockIndex to 0 for empty trustchain', async () => {
    const { dataStore } = await makeMemoryDataStore();

    const t = await TrustchainStore.open(dataStore);
    expect(t.lastBlockIndex).to.equal(0);
    await t.close();
  });

  it('retrieves a previously stored lastBlockIndex', async () => {
    const { dataStore } = await makeMemoryDataStore();

    await dataStore.put(TABLE_METADATA, { _id: LAST_BLOCK_INDEX_KEY, index: 42 });

    const t = await TrustchainStore.open(dataStore);
    expect(t.lastBlockIndex).to.equal(42);
    await t.close();
  });

  it('sets and persists the given last block index if greater than current one', async () => {
    const { config, dataStore } = await makeMemoryDataStore();

    const t = await TrustchainStore.open(dataStore);
    await t.updateLastBlockIndex(5);
    expect(t.lastBlockIndex).to.equal(5);

    await t.updateLastBlockIndex(3); // nope, 3 is not greater than 5
    expect(t.lastBlockIndex).to.equal(5);

    await t.close();

    // verify that the value is persisted in the dataStore
    const dataStore2 = await openDataStore(config);
    const record = await dataStore2.get(TABLE_METADATA, LAST_BLOCK_INDEX_KEY);
    expect(record).to.include({ _id: LAST_BLOCK_INDEX_KEY, index: 5 });
  });
});
