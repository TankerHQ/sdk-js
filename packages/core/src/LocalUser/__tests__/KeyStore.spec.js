// @flow

import { ready as cryptoReady, tcrypto, random } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import dataStoreConfig, { makePrefix, openDataStore } from '../../__tests__/TestDataStore';

import KeyStore from '../KeyStore';

describe('KeyStore', () => {
  let datastoresToClose;
  let openKeystore;
  let secret;

  const { schemas } = KeyStore;

  before(() => cryptoReady);

  beforeEach(async () => {
    datastoresToClose = [];
    secret = createUserSecretBinary('trustchainid', 'bob');

    const dbName = `keystore-test-${makePrefix()}`;

    openKeystore = async () => {
      const datastore = await openDataStore({ ...dataStoreConfig, dbName, schemas });
      datastoresToClose.push(datastore);
      return KeyStore.open(datastore, secret);
    };
  });

  afterEach(async () => {
    await Promise.all([datastoresToClose.map(d => d.close())]);
  });

  it('creates an "empty" safe when first opened', async () => {
    const keystore = await openKeystore();
    const localData = keystore.localData;

    expect(localData.deviceId).to.be.null;
    expect(localData.deviceEncryptionKeyPair).to.be.null;
    expect(localData.deviceSignatureKeyPair).to.be.null;
  });

  it('can save local data, and retrieve data from the same keystore again', async () => {
    const fakeDevice = {
      deviceId: random(tcrypto.HASH_SIZE),
      devicePublicEncryptionKey: random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
      devicePublicSignatureKey: random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
      isGhostDevice: true,
      revoked: true,
    };

    const keystore = await openKeystore();
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
    expect(keystore.localData).to.deep.equal(localData);

    const keystore2 = await openKeystore();
    expect(keystore2.localData).to.deep.equal(localData);
  });
});
