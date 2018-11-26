// @flow

import { tcrypto, createUserSecretBinary, utils } from '@tanker/crypto';

import { expect } from './chai';
import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';

import KeySafe from '../Session/KeySafe';
import Keystore from '../Session/Keystore';

describe('Keystore', () => {
  let dbName;
  let keystoreConfig;
  let datastore;
  const { schemas } = Keystore;

  beforeEach(async () => {
    dbName = `keystore-test-${makePrefix()}`;
    keystoreConfig = { ...dataStoreConfig, dbName, schemas };
    datastore = await openDataStore(keystoreConfig);
  });

  it('has always a "keySafe" record', async () => {
    const secret = createUserSecretBinary('trustchainid', 'user-id');
    const store = await Keystore.open(datastore, secret);
    expect(store._safe instanceof KeySafe).to.be.true; // eslint-disable-line no-underscore-dangle
  });

  it('should keep our keys between two sessions', async () => {
    const userSecret = createUserSecretBinary('trustchainid', 'Merkle–Damgård');
    const getAllKeys = (k) => ({
      privateSignatureKey: k.privateSignatureKey,
      publicSignatureKey: k.publicSignatureKey,
      privateEncryptionKey: k.privateEncryptionKey,
      publicEncryptionKey: k.publicEncryptionKey
    });
    let keystore = await Keystore.open(datastore, userSecret);
    const before = getAllKeys(keystore);
    await datastore.close();
    datastore = await openDataStore(keystoreConfig);
    keystore = await Keystore.open(datastore, userSecret);
    const after = getAllKeys(keystore);
    expect(after).to.deep.equal(before);
  });


  it('creates a safe when first opened that can be re-opened later', async () => {
    const secret = createUserSecretBinary('trustchainid', 'user-id');
    const keystore1 = await Keystore.open(datastore, secret);
    const generatedKey = keystore1.privateEncryptionKey;
    const keystore2 = await Keystore.open(datastore, secret);
    const savedKey = keystore2.privateEncryptionKey;
    expect(generatedKey).to.deep.equal(savedKey);
  });

  it('can set the device ID', async () => {
    const secret = createUserSecretBinary('trustchainid', 'bob');
    const keystore = await Keystore.open(datastore, secret);
    await keystore.setDeviceId(utils.fromString('bob-laptop-hash'));
    // $FlowIKnow
    expect(utils.toString(keystore.deviceId)).to.eq('bob-laptop-hash');
  });

  it('can insert user keys in the right order', async () => {
    const secret = createUserSecretBinary('trustchainid', 'bob');
    const keystore = await Keystore.open(datastore, secret);

    const key1 = tcrypto.makeEncryptionKeyPair();
    const key2 = tcrypto.makeEncryptionKeyPair();
    const key3 = tcrypto.makeEncryptionKeyPair();

    await keystore.addUserKey(key2);
    await keystore.prependUserKey(key1);
    await keystore.addUserKey(key3);

    // $FlowIKnow
    expect(keystore.userKeys).to.deep.eq([key1, key2, key3]);
  });

  it('can find a user key', async () => {
    const secret = createUserSecretBinary('trustchainid', 'bob');
    const keystore = await Keystore.open(datastore, secret);

    const key1 = tcrypto.makeEncryptionKeyPair();
    const key2 = tcrypto.makeEncryptionKeyPair();
    const key3 = tcrypto.makeEncryptionKeyPair();

    await keystore.addUserKey(key1); //eslint-disable-line no-underscore-dangle
    await keystore.addUserKey(key2); //eslint-disable-line no-underscore-dangle
    await keystore.addUserKey(key3); //eslint-disable-line no-underscore-dangle

    expect(keystore.findUserKey(key2.publicKey)).to.deep.eq(key2);
  });
});
