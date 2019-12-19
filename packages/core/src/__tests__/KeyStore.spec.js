// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';

import KeyStore from '../Session/LocalUser/KeyStore';

describe('KeyStore', () => {
  let dbName;
  let keystoreConfig;
  let datastore;
  let secret;
  const { schemas } = KeyStore;

  beforeEach(async () => {
    dbName = `keystore-test-${makePrefix()}`;
    keystoreConfig = { ...dataStoreConfig, dbName, schemas };
    datastore = await openDataStore(keystoreConfig);
    secret = createUserSecretBinary('trustchainid', 'bob');
  });

  it('creates a safe when first opened that can be re-opened later', async () => {
    const getAllKeys = (k) => ({
      privateSignatureKey: k.signatureKeyPair.privateKey,
      publicSignatureKey: k.signatureKeyPair.publicKey,
      privateEncryptionKey: k.encryptionKeyPair.privateKey,
      publicEncryptionKey: k.encryptionKeyPair.publicKey,
    });

    const keystore1 = await KeyStore.open(datastore, secret);
    const keys1 = getAllKeys(keystore1);

    await datastore.close();
    datastore = await openDataStore(keystoreConfig);

    const keystore2 = await KeyStore.open(datastore, secret);
    const keys2 = getAllKeys(keystore2);

    expect(keys1).to.deep.equal(keys2);
  });

  it('can set the device ID', async () => {
    const keystore = await KeyStore.open(datastore, secret);
    await keystore.setDeviceId(utils.fromString('bob-laptop-hash'));
    // $FlowIKnow
    expect(utils.toString(keystore.deviceId)).to.eq('bob-laptop-hash');
  });

  it('can insert user keys in the right order', async () => {
    const keystore = await KeyStore.open(datastore, secret);

    const key2 = tcrypto.makeEncryptionKeyPair();
    const key3 = tcrypto.makeEncryptionKeyPair();

    await keystore.addUserKey(key2);
    await keystore.addUserKey(key3);

    expect(keystore.userKeys).to.deep.eq([key2, key3]);
  });
});
