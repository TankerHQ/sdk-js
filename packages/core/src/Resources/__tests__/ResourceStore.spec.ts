import { random, ready as cryptoReady, tcrypto } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import dataStoreConfig, { makePrefix, openDataStore } from '../../__tests__/TestDataStore';

import SharedKeystore from '../ResourceStore';

describe('ResourceStore', () => {
  let sharedKeystore: SharedKeystore;

  before(() => cryptoReady);

  beforeEach(async () => {
    const dbName = `sharedKeystore-test-${makePrefix()}`;
    const userSecret = createUserSecretBinary('trustchainid', 'Merkle–Damgård');
    const sharedKeystoreConfig = { dbName, ...dataStoreConfig, schemas: SharedKeystore.schemas };
    const datastore = await openDataStore(sharedKeystoreConfig);
    sharedKeystore = await SharedKeystore.open(datastore, userSecret);
  });

  it('saves and finds resources keys', async () => {
    const key1 = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);
    await sharedKeystore.saveResourceKey(resourceId, key1);
    const key2 = await sharedKeystore.findResourceKey(resourceId);
    expect(key1).to.deep.equal(key2);
  });

  it('ignores updates to a resource key', async () => {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const key2 = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    await sharedKeystore.saveResourceKey(resourceId, key);
    await sharedKeystore.saveResourceKey(resourceId, key2);
    const thekey = await sharedKeystore.findResourceKey(resourceId);
    expect(thekey).to.deep.equal(key);
  });
});
