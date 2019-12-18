// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import TestGenerator from './TestGenerator';

import { serializeBlock } from '../Blocks/payloads';
import { type UserKeys } from '../Users/Serialize';
import LocalUser from '../Session/LocalUser/LocalUser';
import { extractUserData } from '../Session/UserData';
import { type ProvisionalUserKeyPairs } from '../Session/LocalUser/KeySafe';

class FakeKeyStore {
  signatureKeyPair: tcrypto.SodiumKeyPair;
  encryptionKeyPair: tcrypto.SodiumKeyPair;
  userKeys: Array<tcrypto.SodiumKeyPair>;
  encryptedUserKeys: Array<UserKeys>;
  provisionalUserKeys: Array<ProvisionalUserKeyPairs>;
  deviceId: Uint8Array;
  trustchainPublicKey: ?Uint8Array;

  constructor(signatureKeyPair: tcrypto.SodiumKeyPair, encryptionKeyPair: tcrypto.SodiumKeyPair) {
    this.signatureKeyPair = signatureKeyPair;
    this.encryptionKeyPair = encryptionKeyPair;
    this.userKeys = [];
    this.encryptedUserKeys = [];
    this.provisionalUserKeys = [];
    this.trustchainPublicKey = null;
  }

  setDeviceId = (deviceId: Uint8Array) => { this.deviceId = deviceId; };
  addProvisionalUserKeys = (id: string, appEncryptionKeyPair: tcrypto.SodiumKeyPair, tankerEncryptionKeyPair: tcrypto.SodiumKeyPair) => this.provisionalUserKeys.push({ id, appEncryptionKeyPair, tankerEncryptionKeyPair });
  addUserKey = (userKey: tcrypto.SodiumKeyPair) => { this.userKeys.push(userKey); };
  prependUserKey = (userKey: tcrypto.SodiumKeyPair) => this.userKeys.push(userKey);
  prependEncryptedUserKey = (keys: UserKeys) => { this.encryptedUserKeys.push(keys); };
  takeEncryptedUserKeys = () => this.encryptedUserKeys;
  setTrustchainPublicKey = (trustchainPublicKey) => { this.trustchainPublicKey = trustchainPublicKey; }
}

describe('Local User', () => {
  let localUser;
  let trustchainCreationBlock;
  let deviceCreation1;
  let deviceCreation1Block;
  let deviceCreation2;
  let deviceCreation2Block;
  let keyStore;
  let testGenerator;
  let trustchainId;
  let trustchainKeyPair;
  let userIdString;
  let identity;
  let userData;

  before(async () => {
    trustchainKeyPair = tcrypto.makeSignKeyPair();
    trustchainId = utils.generateAppID(trustchainKeyPair.publicKey);
    userIdString = 'clear user id';
  });

  beforeEach(async () => {
    testGenerator = new TestGenerator();
    const trustchainCreation = testGenerator.makeTrustchainCreation();
    trustchainId = utils.toBase64(trustchainCreation.unverifiedTrustchainCreation.hash);
    trustchainKeyPair = trustchainCreation.trustchainKeys;
    identity = await createIdentity(trustchainId, utils.toBase64(trustchainKeyPair.privateKey), userIdString);
    userData = extractUserData(identity);

    trustchainCreationBlock = utils.toBase64(serializeBlock(trustchainCreation.block));
    deviceCreation1 = await testGenerator.makeUserCreation(userData.userId);
    deviceCreation1Block = utils.toBase64(serializeBlock(deviceCreation1.block));
    deviceCreation2 = testGenerator.makeDeviceCreation(deviceCreation1);
    deviceCreation2Block = utils.toBase64(serializeBlock(deviceCreation2.block));
    keyStore = new FakeKeyStore(deviceCreation2.testDevice.signKeys, deviceCreation2.testDevice.encryptionKeys);
    localUser = new LocalUser(userData, (keyStore: any));
  });

  it('doesnt save our device ID if the key is for another device', async () => {
    await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block]);
    expect(keyStore.deviceId).to.be.undefined;
  });

  it('saves our device ID', async () => {
    await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation2Block]);
    expect(keyStore.deviceId).to.deep.equal(deviceCreation2.unverifiedDeviceCreation.hash);
  });

  it('decrypts and adds user keys', async () => {
    await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation2Block]);
    expect([deviceCreation2.testUser.userKeys[0]]).excluding('index').to.deep.equal(keyStore.userKeys);
  });

  describe('with revocation before own creation', () => {
    let deviceRevocation;
    let deviceCreation3Block;
    let deviceRevocationBlock;
    beforeEach(() => {
      const deviceCreation3 = testGenerator.makeDeviceCreation(deviceCreation1);
      deviceCreation3Block = utils.toBase64(serializeBlock(deviceCreation3.block));
      deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation1, deviceCreation3.testDevice.id);
      deviceRevocationBlock = utils.toBase64(serializeBlock(deviceRevocation.block));
      deviceCreation2 = testGenerator.makeDeviceCreation({ ...deviceCreation1, testUser: deviceRevocation.testUser });
      deviceCreation2Block = utils.toBase64(serializeBlock(deviceCreation2.block));
      keyStore = new FakeKeyStore(deviceCreation2.testDevice.signKeys, deviceCreation2.testDevice.encryptionKeys);
      localUser = new LocalUser(userData, (keyStore: any));
    });

    it('decrypts encrypted user keys', async () => {
      await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation3Block, deviceRevocationBlock, deviceCreation2Block]);
      expect([deviceRevocation.testUser.userKeys[1], deviceRevocation.testUser.userKeys[0]]).excluding('index').to.deep.equal(keyStore.userKeys);
      expect(deviceRevocation.testUser.userKeys[1]).excluding('index').to.deep.equal(localUser.currentUserKey);
    });
  });


  describe('with revocation before own creation', () => {
    let deviceRevocation;
    let deviceCreation3Block;
    let deviceRevocationBlock;
    let deviceRevocation2;
    let deviceRevocationBlock2;

    beforeEach(() => {
      deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation1, deviceCreation2.testDevice.id);
      deviceRevocationBlock = utils.toBase64(serializeBlock(deviceRevocation.block));

      deviceCreation1.testUser = deviceRevocation.testUser;
      const deviceCreation3 = testGenerator.makeDeviceCreation(deviceCreation1);
      deviceCreation3Block = utils.toBase64(serializeBlock(deviceCreation3.block));

      deviceRevocation2 = testGenerator.makeDeviceRevocation(deviceCreation3, deviceCreation1.testDevice.id);
      deviceRevocationBlock2 = utils.toBase64(serializeBlock(deviceRevocation2.block));

      keyStore = new FakeKeyStore(deviceCreation3.testDevice.signKeys, deviceCreation3.testDevice.encryptionKeys);
      localUser = new LocalUser(userData, (keyStore: any));
    });

    it('decrypts encrypted user keys', async () => {
      await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation2Block, deviceRevocationBlock, deviceCreation3Block, deviceRevocationBlock2]);
      expect([deviceRevocation2.testUser.userKeys[2], deviceRevocation2.testUser.userKeys[1], deviceRevocation2.testUser.userKeys[0]]).excluding('index').to.deep.equal(keyStore.userKeys);
      expect(deviceRevocation2.testUser.userKeys[2]).excluding('index').to.deep.equal(localUser.currentUserKey);
    });
  });

  describe('with revocation after own creation', () => {
    it('decrypts new user keys', async () => {
      const deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation2, deviceCreation1.testDevice.id);
      const deviceRevocationBlock = utils.toBase64(serializeBlock(deviceRevocation.block));

      await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation2Block, deviceRevocationBlock]);
      expect([deviceRevocation.testUser.userKeys[1], deviceRevocation.testUser.userKeys[0]]).excluding('index').to.deep.equal(keyStore.userKeys);
      expect(deviceRevocation.testUser.userKeys[1]).excluding('index').to.deep.equal(localUser.currentUserKey);
    });
  });
});
