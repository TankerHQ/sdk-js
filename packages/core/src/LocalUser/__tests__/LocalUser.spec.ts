import { ready as cryptoReady, tcrypto, utils } from '@tanker/crypto';
import type { b64string } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import type { TestUser, TestTrustchainCreation, TestDeviceCreation, TestDeviceRevocation } from '../../__tests__/TestGenerator';
import TestGenerator from '../../__tests__/TestGenerator';

import LocalUser from '../LocalUser';
import { extractUserData } from '../UserData';
import type { UserData } from '../UserData';

const localUserKeysFromTestUser = (user: TestUser) => {
  const userKeys: Record<b64string, tcrypto.SodiumKeyPair> = {};
  let currentUserKey;

  user.userKeys.forEach(userKey => {
    const keyPair = { publicKey: userKey.publicKey, privateKey: userKey.privateKey };
    userKeys[utils.toBase64(userKey.publicKey)] = keyPair;
    currentUserKey = keyPair;
  });
  return { userKeys, currentUserKey };
};

describe('Local User', () => {
  let localUser: LocalUser;
  let trustchainCreation: TestTrustchainCreation;
  let trustchainCreationBlock: b64string;
  let deviceCreation1: TestDeviceCreation;
  let deviceCreation1Block: b64string;
  let deviceCreation2: TestDeviceCreation;
  let deviceCreation2Block: b64string;
  let testGenerator: TestGenerator;
  let trustchainKeyPair: tcrypto.SodiumKeyPair;
  let userIdString: string;
  let identity: b64string;
  let userData: UserData;

  before(async () => {
    await cryptoReady;
    trustchainKeyPair = tcrypto.makeSignKeyPair();
    userIdString = 'clear user id';
  });

  beforeEach(async () => {
    testGenerator = new TestGenerator();
    trustchainCreation = testGenerator.makeTrustchainCreation();
    const trustchainId = utils.toBase64(trustchainCreation.unverifiedTrustchainCreation.hash);
    trustchainKeyPair = trustchainCreation.trustchainKeys;
    identity = await createIdentity(trustchainId, utils.toBase64(trustchainKeyPair.privateKey), userIdString);
    userData = extractUserData(identity);

    trustchainCreationBlock = trustchainCreation.block;
    deviceCreation1 = await testGenerator.makeUserCreation(userData.userId);
    deviceCreation1Block = deviceCreation1.block;
    deviceCreation2 = testGenerator.makeDeviceCreation(deviceCreation1);
    deviceCreation2Block = deviceCreation2.block;

    const localData = {
      deviceSignatureKeyPair: deviceCreation2.testDevice.signKeys,
      deviceEncryptionKeyPair: deviceCreation2.testDevice.encryptionKeys,
      userKeys: {},
      currentUserKey: null,
      devices: [],
      deviceId: deviceCreation2.testDevice.id,
      trustchainPublicKey: null,
    };
    localUser = new LocalUser(userData.trustchainId, userData.userId, userData.userSecret, localData);
  });

  it('initializes data correctly', async () => {
    await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation2Block]);
    expect(localUser.trustchainPublicKey).to.deep.equal(trustchainCreation.trustchainKeys.publicKey);
  });

  it('decrypts and adds user keys', async () => {
    await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation2Block]);
    const { userKeys, currentUserKey } = localUserKeysFromTestUser(deviceCreation2.testUser);

    expect(userKeys).to.deep.equal(localUser._userKeys); //eslint-disable-line no-underscore-dangle
    expect(currentUserKey).to.deep.equal(localUser.currentUserKey);
  });

  describe('with revocation before own creation', () => {
    let deviceRevocation: TestDeviceRevocation;
    let deviceCreation3: TestDeviceCreation;
    let deviceCreation3Block: b64string;
    let deviceRevocationBlock: b64string;

    beforeEach(() => {
      deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation1, deviceCreation2.testDevice.id);
      deviceRevocationBlock = deviceRevocation.block;
      deviceCreation3 = testGenerator.makeDeviceCreation({ ...deviceCreation1, testUser: deviceRevocation.testUser });
      deviceCreation3Block = deviceCreation3.block;

      const localData = {
        deviceSignatureKeyPair: deviceCreation3.testDevice.signKeys,
        deviceEncryptionKeyPair: deviceCreation3.testDevice.encryptionKeys,
        userKeys: {},
        currentUserKey: null,
        devices: [],
        deviceId: deviceCreation3.testDevice.id,
        trustchainPublicKey: null,
      };
      localUser = new LocalUser(userData.trustchainId, userData.userId, userData.userSecret, localData);
    });

    it('decrypts encrypted user keys', async () => {
      await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation2Block, deviceRevocationBlock, deviceCreation3Block]);

      const { userKeys, currentUserKey } = localUserKeysFromTestUser(deviceCreation3.testUser);

      expect(userKeys).to.deep.equal(localUser._userKeys); //eslint-disable-line no-underscore-dangle
      expect(currentUserKey).to.deep.equal(localUser.currentUserKey);
    });
  });

  describe('with revocation after own creation', () => {
    it('decrypts new user keys', async () => {
      const deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation2, deviceCreation1.testDevice.id);
      const deviceRevocationBlock = deviceRevocation.block;

      await localUser.initializeWithBlocks([trustchainCreationBlock, deviceCreation1Block, deviceCreation2Block, deviceRevocationBlock]);
      const { userKeys, currentUserKey } = localUserKeysFromTestUser(deviceRevocation.testUser);

      expect(userKeys).to.deep.equal(localUser._userKeys); //eslint-disable-line no-underscore-dangle
      expect(currentUserKey).to.deep.equal(localUser.currentUserKey);
    });
  });
});
