// @flow

import { tcrypto, random, utils } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';

import { expect } from './chai';
import TestGenerator from './TestGenerator';

import { type UserKeys } from '../Blocks/payloads';
import LocalUser from '../Session/LocalUser';
import { extractUserData } from '../Session/UserData';
import { type ProvisionalUserKeyPairs } from '../Session/KeySafe';

class FakeKeyStore {
  signatureKeyPair: tcrypto.SodiumKeyPair;
  encryptionKeyPair: tcrypto.SodiumKeyPair;
  userKeys: Array<tcrypto.SodiumKeyPair>;
  encryptedUserKeys: Array<UserKeys>;
  provisionalUserKeys: Array<ProvisionalUserKeyPairs>;
  deviceId: Uint8Array;

  constructor(signatureKeyPair: tcrypto.SodiumKeyPair, encryptionKeyPair: tcrypto.SodiumKeyPair) {
    this.signatureKeyPair = signatureKeyPair;
    this.encryptionKeyPair = encryptionKeyPair;
    this.userKeys = [];
    this.encryptedUserKeys = [];
    this.provisionalUserKeys = [];
  }

  setDeviceId = (deviceId: Uint8Array) => { this.deviceId = deviceId; };
  addProvisionalUserKeys = (id: string, appEncryptionKeyPair: tcrypto.SodiumKeyPair, tankerEncryptionKeyPair: tcrypto.SodiumKeyPair) => this.provisionalUserKeys.push({ id, appEncryptionKeyPair, tankerEncryptionKeyPair });
  addUserKey = (userKey: tcrypto.SodiumKeyPair) => { this.userKeys.push(userKey); };
  prependUserKey = (userKey: tcrypto.SodiumKeyPair) => this.userKeys.push(userKey);
  prependEncryptedUserKey = (keys: UserKeys) => { this.encryptedUserKeys.push(keys); };
  takeEncryptedUserKeys = () => this.encryptedUserKeys;
}

describe('Local User', () => {
  let localUser;
  let deviceCreation1;
  let deviceCreation2;
  let keyStore;
  let testGenerator;
  let trustchainId;
  let trustchainKeyPair;
  let userIdString;
  let identity;
  let userData;

  before(async () => {
    trustchainId = random(tcrypto.HASH_SIZE);
    trustchainKeyPair = tcrypto.makeSignKeyPair();
    userIdString = 'clear user id';
    identity = await createIdentity(utils.toBase64(trustchainId), utils.toBase64(trustchainKeyPair.privateKey), userIdString);
    userData = extractUserData(identity);
  });

  beforeEach(async () => {
    testGenerator = new TestGenerator();
    testGenerator.makeTrustchainCreation();
    deviceCreation1 = await testGenerator.makeUserCreation(userData.userId);
    deviceCreation2 = testGenerator.makeDeviceCreation(deviceCreation1);
    keyStore = new FakeKeyStore(deviceCreation2.testDevice.signKeys, deviceCreation2.testDevice.encryptionKeys);
    localUser = new LocalUser(userData, (keyStore: any));
  });

  it('doesnt save our device ID if the key is for another device', async () => {
    await localUser.applyDeviceCreation(deviceCreation1.unverifiedDeviceCreation);
    expect(keyStore.deviceId).to.be.undefined;
  });

  it('throws if asked for deviceID when its not set', async () => {
    expect(() => localUser.deviceId).to.throw();
  });

  it('saves our device ID', async () => {
    await localUser.applyDeviceCreation(deviceCreation2.unverifiedDeviceCreation);
    expect(keyStore.deviceId).to.deep.equal(deviceCreation2.unverifiedDeviceCreation.hash);
  });

  it('decrypts and adds user keys', async () => {
    await localUser.applyDeviceCreation(deviceCreation2.unverifiedDeviceCreation);
    expect([deviceCreation2.testUser.userKeys[0]]).excluding('index').to.deep.equal(keyStore.userKeys);
  });

  describe('with revocation before own creation', () => {
    let deviceRevocation;
    beforeEach(() => {
      const deviceCreation3 = testGenerator.makeDeviceCreation(deviceCreation1);
      deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation1, deviceCreation3.testDevice.id);
      deviceCreation2 = testGenerator.makeDeviceCreation({ ...deviceCreation1, testUser: deviceRevocation.testUser });
      keyStore = new FakeKeyStore(deviceCreation2.testDevice.signKeys, deviceCreation2.testDevice.encryptionKeys);
      localUser = new LocalUser(userData, (keyStore: any));
    });

    it('stores encrypted user keys', async () => {
      await localUser.applyDeviceRevocation(deviceRevocation.unverifiedDeviceRevocation);
      expect(keyStore.userKeys).to.deep.equal([]);
      expect(keyStore.encryptedUserKeys.length).to.equal(1);
    });

    it('restores encrypted user keys', async () => {
      await localUser.applyDeviceRevocation(deviceRevocation.unverifiedDeviceRevocation);
      await localUser.applyDeviceCreation(deviceCreation2.unverifiedDeviceCreation);
      expect([deviceRevocation.testUser.userKeys[1], deviceRevocation.testUser.userKeys[0]]).excluding('index').to.deep.equal(keyStore.userKeys);
      expect(deviceRevocation.testUser.userKeys[1]).excluding('index').to.deep.equal(localUser.currentUserKey);
    });

    it('stores provisional identity keys', async () => {
      await localUser.applyDeviceCreation(deviceCreation2.unverifiedDeviceCreation);
      const claim = testGenerator.makeProvisionalIdentityClaim(deviceCreation1, localUser.userId, localUser.currentUserKey.publicKey);
      await localUser.applyProvisionalIdentityClaim(claim.unverifiedProvisionalIdentityClaim);
      expect(keyStore.provisionalUserKeys.length).to.equal(1);
    });
  });

  describe('with revocation after own creation', () => {
    it('decrypts new user keys', async () => {
      await localUser.applyDeviceCreation(deviceCreation2.unverifiedDeviceCreation);
      const deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation2, deviceCreation1.testDevice.id);

      await localUser.applyDeviceRevocation(deviceRevocation.unverifiedDeviceRevocation);
      expect(deviceRevocation.testUser.userKeys).excluding('index').to.deep.equal(keyStore.userKeys);
      expect(deviceRevocation.testUser.userKeys[1]).excluding('index').to.deep.equal(localUser.currentUserKey);
    });
  });
});
