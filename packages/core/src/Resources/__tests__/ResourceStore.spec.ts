import { random, ready as cryptoReady, tcrypto } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import { dataStoreConfig, makePrefix, openDataStore } from '../../__tests__/TestDataStore';
import { Storage } from '../../Session/Storage';

import { ResourceStore } from '../ResourceStore';

describe('ResourceStore', () => {
  let resourceStore: ResourceStore;

  before(() => cryptoReady);

  beforeEach(async () => {
    const dbName = `sharedKeystore-test-${makePrefix()}`;
    const userSecret = createUserSecretBinary('trustchainid', 'Merkle–Damgård');
    const sharedKeystoreConfig = { dbName, ...dataStoreConfig, schemas: ResourceStore.schemas, defaultVersion: Storage.defaultVersion };
    const datastore = await openDataStore(sharedKeystoreConfig);
    resourceStore = await ResourceStore.open(datastore, userSecret);
  });

  it('saves and finds resources keys', async () => {
    const key1 = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);
    await resourceStore.saveResourceKey(resourceId, key1);
    const key2 = await resourceStore.findResourceKey(resourceId);
    expect(key1).to.deep.equal(key2);
  });

  it('ignores updates to a resource key', async () => {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const key2 = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    await resourceStore.saveResourceKey(resourceId, key);
    await resourceStore.saveResourceKey(resourceId, key2);
    const thekey = await resourceStore.findResourceKey(resourceId);
    expect(thekey).to.deep.equal(key);
  });
});
