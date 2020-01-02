// @flow

import { tcrypto, random } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';

import KeyStore from '../LocalUser/KeyStore';

describe('KeyStore', () => {
  let dbName;
  let keystoreConfig;
  let datastore;
  let secret;
  const { schemas } = KeyStore;

  const fakeDevice = {
    deviceId: random(tcrypto.HASH_SIZE),
    devicePublicEncryptionKey: random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
    devicePublicSignatureKey: random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
    isGhostDevice: true,
    revoked: true,
  };

  beforeEach(async () => {
    dbName = `keystore-test-${makePrefix()}`;
    keystoreConfig = { ...dataStoreConfig, dbName, schemas };
    datastore = await openDataStore(keystoreConfig);
    secret = createUserSecretBinary('trustchainid', 'bob');
  });

  it('creates a safe when first opened that can be re-opened later', async () => {
    const keystore1 = await KeyStore.open(datastore, secret);
    const keys1 = keystore1.localData;

    await datastore.close();
    datastore = await openDataStore(keystoreConfig);

    const keystore2 = await KeyStore.open(datastore, secret);
    const keys2 = keystore2.localData;

    expect(keys1).to.deep.equal(keys2);
  });

  it('can set and save local data', async () => {
    const keystore = await KeyStore.open(datastore, secret);
    const localData = {
      deviceSignatureKeyPair: keystore.localData.deviceSignatureKeyPair,
      deviceEncryptionKeyPair: keystore.localData.deviceEncryptionKeyPair,
      userKeys: { AAAAAAAA: tcrypto.makeEncryptionKeyPair() },
      currentUserKey: tcrypto.makeEncryptionKeyPair(),
      devices: [fakeDevice, fakeDevice],
      deviceId: random(tcrypto.HASH_SIZE),
      trustchainPublicKey: random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
    };
    await keystore.save(localData, secret);

    await datastore.close();
    datastore = await openDataStore(keystoreConfig);

    const keystore2 = await KeyStore.open(datastore, secret);
    expect(keystore2.localData).to.deep.equal(localData);
  });

  it('can cannot change device keys', async () => {
    const keystore = await KeyStore.open(datastore, secret);
    const deviceSignatureKeyPair = keystore.localData.deviceSignatureKeyPair;
    const deviceEncryptionKeyPair = keystore.localData.deviceEncryptionKeyPair;

    const localData = {
      deviceSignatureKeyPair: tcrypto.makeSignKeyPair(),
      deviceEncryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
      userKeys: { AAAAAAAA: tcrypto.makeEncryptionKeyPair() },
      currentUserKey: tcrypto.makeEncryptionKeyPair(),
      devices: [fakeDevice, fakeDevice],
      deviceId: random(tcrypto.HASH_SIZE),
      trustchainPublicKey: random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
    };
    await keystore.save(localData, secret);

    await datastore.close();
    datastore = await openDataStore(keystoreConfig);

    const keystore2 = await KeyStore.open(datastore, secret);
    expect(keystore2.localData.deviceEncryptionKeyPair).to.deep.equal(deviceEncryptionKeyPair);
    expect(keystore2.localData.deviceSignatureKeyPair).to.deep.equal(deviceSignatureKeyPair);
  });
});
