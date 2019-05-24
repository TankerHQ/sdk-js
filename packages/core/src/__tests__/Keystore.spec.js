// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';

import { expect } from './chai';
import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';

import type { UserKeys } from '../Blocks/payloads';
import Keystore from '../Session/Keystore';

describe('Keystore', () => {
  let dbName;
  let keystoreConfig;
  let datastore;
  let secret;
  const { schemas } = Keystore;

  beforeEach(async () => {
    dbName = `keystore-test-${makePrefix()}`;
    keystoreConfig = { ...dataStoreConfig, dbName, schemas };
    datastore = await openDataStore(keystoreConfig);
    secret = createUserSecretBinary('trustchainid', 'bob');
  });

  it('creates a safe when first opened that can be re-opened later', async () => {
    const getAllKeys = (k) => ({
      privateSignatureKey: k.privateSignatureKey,
      publicSignatureKey: k.publicSignatureKey,
      privateEncryptionKey: k.privateEncryptionKey,
      publicEncryptionKey: k.publicEncryptionKey
    });

    const keystore1 = await Keystore.open(datastore, secret);
    const keys1 = getAllKeys(keystore1);

    await datastore.close();
    datastore = await openDataStore(keystoreConfig);

    const keystore2 = await Keystore.open(datastore, secret);
    const keys2 = getAllKeys(keystore2);

    expect(keys1).to.deep.equal(keys2);
  });

  it('can set the device ID', async () => {
    const keystore = await Keystore.open(datastore, secret);
    await keystore.setDeviceId(utils.fromString('bob-laptop-hash'));
    // $FlowIKnow
    expect(utils.toString(keystore.deviceId)).to.eq('bob-laptop-hash');
  });

  it('can insert user keys in the right order', async () => {
    const keystore = await Keystore.open(datastore, secret);

    const key1 = tcrypto.makeEncryptionKeyPair();
    const key2 = tcrypto.makeEncryptionKeyPair();
    const key3 = tcrypto.makeEncryptionKeyPair();

    await keystore.addUserKey(key2);
    await keystore.prependUserKey(key1);
    await keystore.addUserKey(key3);

    expect(keystore.userKeys).to.deep.eq([key1, key2, key3]);
  });

  it('can prepend then take all encrypted user keys', async () => {
    const keystore = await Keystore.open(datastore, secret);

    const key1: UserKeys = ('key1': any);
    const key2: UserKeys = ('key2': any);

    await keystore.prependEncryptedUserKey(key2);
    await keystore.prependEncryptedUserKey(key1);

    let keys = await keystore.takeEncryptedUserKeys();
    expect(keys).to.deep.eq([key1, key2]);

    keys = await keystore.takeEncryptedUserKeys();
    expect(keys).to.deep.eq([]);
  });

  it('can find a user key', async () => {
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
