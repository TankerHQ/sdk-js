// @flow
import { random, createUserSecretBinary, tcrypto } from '@tanker/crypto';

import { expect } from './chai';
import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';

import SharedKeystore from '../Resource/ResourceStore';

describe('ResourceStore', () => {
  let dbName;
  let userSecret;
  let sharedKeystoreConfig;
  let sharedKeystore;
  let datastore;

  beforeEach(async () => {
    dbName = `sharedKeystore-test-${makePrefix()}`;
    userSecret = createUserSecretBinary('trustchainid', 'Merkle–Damgård');
    sharedKeystoreConfig = { dbName, ...dataStoreConfig, schemas: SharedKeystore.schemas };
    datastore = await openDataStore(sharedKeystoreConfig);
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
