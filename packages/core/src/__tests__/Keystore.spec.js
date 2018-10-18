// @flow

import { tcrypto, createUserSecretBinary, utils } from '@tanker/crypto';

import { expect } from './chai';
import dataStoreConfig, { makePrefix, openDataStore } from './dataStoreConfig';
import makeUint8Array from './makeUint8Array';

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
    expect(utils.equalConstTime(generatedKey, savedKey)).to.be.true;
  });

  it('can set the device ID', async () => {
    const secret = createUserSecretBinary('trustchainid', 'bob');
    const keystore = await Keystore.open(datastore, secret);
    await keystore._setDeviceId(utils.fromString('bob-laptop-hash')); // eslint-disable-line no-underscore-dangle
    // $FlowIKnow
    expect(utils.toString(keystore.deviceId)).to.eq('bob-laptop-hash');
  });

  it('can insert user keys in the right order', async () => {
    const secret = createUserSecretBinary('trustchainid', 'bob');
    const keystore = await Keystore.open(datastore, secret);

    const key1 = tcrypto.makeEncryptionKeyPair();
    const key2 = tcrypto.makeEncryptionKeyPair();
    const key3 = tcrypto.makeEncryptionKeyPair();

    await keystore._addUserKey(key2); //eslint-disable-line no-underscore-dangle
    await keystore._prependUserKey(key1); //eslint-disable-line no-underscore-dangle
    await keystore._addUserKey(key3); //eslint-disable-line no-underscore-dangle

    // $FlowIKnow
    expect(keystore.userKeys).to.deep.eq([key1, key2, key3]);
  });

  it('can find a user key', async () => {
    const secret = createUserSecretBinary('trustchainid', 'bob');
    const keystore = await Keystore.open(datastore, secret);

    const key1 = tcrypto.makeEncryptionKeyPair();
    const key2 = tcrypto.makeEncryptionKeyPair();
    const key3 = tcrypto.makeEncryptionKeyPair();

    await keystore._addUserKey(key1); //eslint-disable-line no-underscore-dangle
    await keystore._addUserKey(key2); //eslint-disable-line no-underscore-dangle
    await keystore._addUserKey(key3); //eslint-disable-line no-underscore-dangle

    expect(keystore.findUserKey(key2.publicKey)).to.deep.eq(key2);
  });

  describe('getIdentity', () => {
    let aliceConfig;
    let aliceDatastore;
    let bobConfig;
    let bobDatastore;

    beforeEach(async () => {
      aliceConfig = { ...keystoreConfig, dbName: `alice-${makePrefix()}`, schemas };
      aliceDatastore = await openDataStore(aliceConfig);

      bobConfig = { ...keystoreConfig, dbName: `bob-${makePrefix()}`, schemas };
      bobDatastore = await openDataStore(bobConfig);
    });

    it('does not change when the user re-opens a session', async () => {
      const bobSecret = createUserSecretBinary('trustchainid', 'bob');
      const bobStore1 = await Keystore.open(bobDatastore, bobSecret);
      const id1 = bobStore1.getIdentity();
      const bobStore2 = await Keystore.open(bobDatastore, bobSecret);
      const id2 = bobStore2.getIdentity();
      expect(id1).to.deep.equal(id2);
    });

    it('is different for different users', async () => {
      const aliceSecret = createUserSecretBinary('trustchainid', 'alice');
      const aliceStore = await Keystore.open(aliceDatastore, aliceSecret);
      const aliceId = aliceStore.getIdentity();
      const bobSecret = createUserSecretBinary('trustchainid', 'bob');
      const bobStore = await Keystore.open(bobDatastore, bobSecret);
      const bobId = bobStore.getIdentity();
      expect(aliceId).to.not.eq(bobId);
    });
  });

  describe('user keys', () => {
    function generateUserKeyPair(publicKey: Uint8Array) {
      const keyPair = tcrypto.makeEncryptionKeyPair();
      return {
        encrypted_private_encryption_key: tcrypto.sealEncrypt(keyPair.privateKey, publicKey),
        public_encryption_key: keyPair.publicKey,
      };
    }

    let keyStore;
    let deviceId;

    beforeEach(async () => {
      const secret = createUserSecretBinary('trustchainid', 'user-id');
      keyStore = await Keystore.open(datastore, secret);
      deviceId = makeUint8Array('deviceID', 32);
    });

    it('saves our device ID', async () => {
      const userKeyPair = generateUserKeyPair(keyStore.publicEncryptionKey);
      await keyStore.processDeviceCreationUserKeyPair(deviceId, keyStore.publicEncryptionKey, userKeyPair);
      expect(keyStore.deviceId).to.deep.equal(deviceId);
    });

    it('doesnt save our device ID if the key is for another device', async () => {
      const otherDeviceKeyPair = tcrypto.makeEncryptionKeyPair();
      const userKeyPair = generateUserKeyPair(otherDeviceKeyPair.publicKey);
      await keyStore.processDeviceCreationUserKeyPair(deviceId, otherDeviceKeyPair.publicKey, userKeyPair);
      expect(keyStore.deviceId).to.be.undefined;
    });

    it('decrypts and adds user keys', async () => {
      const keyPair = tcrypto.makeEncryptionKeyPair();
      const userKeyPair = {
        encrypted_private_encryption_key: tcrypto.sealEncrypt(keyPair.privateKey, keyStore.publicEncryptionKey),
        public_encryption_key: keyPair.publicKey,
      };
      await keyStore.processDeviceCreationUserKeyPair(deviceId, keyStore.publicEncryptionKey, userKeyPair);
      expect(keyStore.userKeys).to.deep.equal([keyPair]);
    });

    it('stores encrypted user keys and recovers them', async () => {
      let latestKeyPair = tcrypto.makeEncryptionKeyPair();
      let latestEncryptedUserKeyPair;
      const expectedKeyPairs = [latestKeyPair];

      for (let i = 0; i < 3; ++i) {
        const newKeyPair = tcrypto.makeEncryptionKeyPair();
        const revocationUserKeys = {
          public_encryption_key: newKeyPair.publicKey,
          previous_public_encryption_key: latestKeyPair.publicKey,
          encrypted_previous_encryption_key: tcrypto.sealEncrypt(latestKeyPair.privateKey, newKeyPair.publicKey),
          private_keys: [],
        };

        await keyStore.processDeviceRevocationUserKeys(makeUint8Array('otherdeviceID', 32), revocationUserKeys);
        expect(keyStore.userKeys).to.deep.equal([]);

        latestKeyPair = newKeyPair;
        latestEncryptedUserKeyPair = {
          encrypted_private_encryption_key: tcrypto.sealEncrypt(latestKeyPair.privateKey, keyStore.publicEncryptionKey),
          public_encryption_key: latestKeyPair.publicKey,
        };
        expectedKeyPairs.push(latestKeyPair);
      }

      await keyStore.processDeviceCreationUserKeyPair(deviceId, keyStore.publicEncryptionKey, latestEncryptedUserKeyPair);
      expect(keyStore.userKeys).to.deep.equal(expectedKeyPairs);
    });
  });
});
