// @flow
import { random, tcrypto } from '@tanker/crypto';

import { expect } from './chai';
import UserStore from '../Users/UserStore';
import { type User } from '../Users/User';

import { NATURE } from '../Blocks/payloads';

import { type VerifiedDeviceCreation } from '../UnverifiedStore/UserUnverifiedStore';

import { makeMemoryDataStore } from './TestDataStore';
import TestGenerator, { type TestDeviceCreation } from './TestGenerator';

async function makeUserStore(userId: Uint8Array): Promise<UserStore> {
  const dataStore = await makeMemoryDataStore(UserStore.schemas, 'user-store-test');

  return UserStore.open(dataStore, userId, ({ processDeviceCreationUserKeyPair: () => {} }: any));
}

describe('UserStore', () => {
  const testGenerator = new TestGenerator();
  testGenerator.makeTrustchainCreation();

  let userId = random(tcrypto.HASH_SIZE);
  let userStore: UserStore;
  let deviceCreation: VerifiedDeviceCreation;
  let deviceCreationV1: VerifiedDeviceCreation;

  let user: User;
  let testUserCreation: TestDeviceCreation;

  before(async () => {
    userStore = await makeUserStore(userId);
  });

  beforeEach(() => {
    userId = random(tcrypto.HASH_SIZE);
    testUserCreation = testGenerator.makeUserCreation(userId);
    deviceCreation = testUserCreation.unverifiedDeviceCreation;
    deviceCreationV1 = testUserCreation.unverifiedDeviceCreationV1;
    user = testUserCreation.user;
  });

  describe('applyEntry', () => {
    it('throws on invalid nature', async () => {
      deviceCreation.nature = NATURE.key_publish_to_user;
      await expect(userStore.applyEntry(deviceCreation)).to.be.rejected;
    });
  });

  describe('DeviceCreation', () => {
    it('applies and finds a DeviceCreationV1 (device key)', async () => {
      user.userPublicKeys = [];

      await userStore.applyEntry(deviceCreationV1);
      const foundUser = await userStore.findUser({ userId });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(user);
    });

    it('applies and finds a DeviceCreationV3 (user key)', async () => {
      await userStore.applyEntry(deviceCreation);
      const foundUser = await userStore.findUser({ userId });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(user);
    });

    it('applies and finds multiples DeviceCreationV1 (device keys)', async () => {
      await userStore.applyEntry(deviceCreationV1);

      const secondDeviceCreation = testGenerator.makeDeviceCreation(testUserCreation);
      await userStore.applyEntry(secondDeviceCreation.unverifiedDeviceCreationV1);

      const thirdDeviceCreation = testGenerator.makeDeviceCreation(testUserCreation);
      await userStore.applyEntry(thirdDeviceCreation.unverifiedDeviceCreationV1);

      user = thirdDeviceCreation.user;
      user.userPublicKeys = [];

      const foundUser = await userStore.findUser({ userId });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(user);
    });

    it('applies and finds multiples DeviceCreationV3 (user keys)', async () => {
      await userStore.applyEntry(deviceCreation);

      const secondDeviceCreation = testGenerator.makeDeviceCreation(testUserCreation);
      await userStore.applyEntry(secondDeviceCreation.unverifiedDeviceCreation);
      const thirdDeviceCreation = testGenerator.makeDeviceCreation(testUserCreation);
      await userStore.applyEntry(thirdDeviceCreation.unverifiedDeviceCreation);
      const foundUser = await userStore.findUser({ userId });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(thirdDeviceCreation.user);
    });
  });

  describe('DeviceRevocation', () => {
    let deviceRevocation;

    beforeEach(() => {
      const testDeviceRevocation = testGenerator.makeDeviceRevocation(testUserCreation, testUserCreation.testDevice.id);
      deviceRevocation = testDeviceRevocation.unverifiedDeviceRevocation;
      user = testDeviceRevocation.user;
    });

    it('applies a DeviceRevocation (on device V1)', async () => {
      await userStore.applyEntry(deviceCreationV1);

      deviceRevocation.nature = NATURE.device_revocation_v1;
      delete deviceRevocation.user_keys;
      await userStore.applyEntry(deviceRevocation);
      const foundUser = await userStore.findUser({ userId });

      user.userPublicKeys = [];
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(user);
    });

    it('applies a DeviceRevocation (on device V3)', async () => {
      await userStore.applyEntry(deviceCreation);
      await userStore.applyEntry(deviceRevocation);
      const foundUser = await userStore.findUser({ userId });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(user);
    });

    it('DeviceRevocations are only applied to the right device', async () => {
      await userStore.applyEntry(deviceCreation);
      const secondDeviceCreation = testGenerator.makeDeviceCreation(testUserCreation);
      await userStore.applyEntry(secondDeviceCreation.unverifiedDeviceCreation);
      const testDeviceRevocation = testGenerator.makeDeviceRevocation(secondDeviceCreation, secondDeviceCreation.testDevice.id);
      await userStore.applyEntry(testDeviceRevocation.unverifiedDeviceRevocation);

      const foundUser = await userStore.findUser({ userId });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(testDeviceRevocation.user);
    });
  });

  describe('Find by deviceId', () => {
    it('finds a DeviceCreationV1 with deviceId', async () => {
      user.userPublicKeys = [];

      await userStore.applyEntry(deviceCreationV1);
      const foundUser = await userStore.findUser({ deviceId: deviceCreation.hash });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(user);
    });

    it('finds a DeviceCreationV3 with deviceId', async () => {
      await userStore.applyEntry(deviceCreation);
      const foundUser = await userStore.findUser({ deviceId: deviceCreation.hash });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(user);
    });

    it('finds a DeviceCreationV1 with findDevice', async () => {
      user.userPublicKeys = [];

      await userStore.applyEntry(deviceCreationV1);
      const foundDevice = await userStore.findDevice({ deviceId: deviceCreation.hash });
      expect(foundDevice).excluding(['_rev', '_id']).to.deep.equal(user.devices[0]);
    });

    it('finds a DeviceCreationV3 with findDevice', async () => {
      await userStore.applyEntry(deviceCreation);
      const foundDevice = await userStore.findDevice({ deviceId: deviceCreation.hash });
      expect(foundDevice).excluding(['_rev', '_id']).to.deep.equal(user.devices[0]);
    });
  });

  describe('Find by userPublicKey', () => {
    it('find a DeviceCreationV3 by userPublicKey', async () => {
      await userStore.applyEntry(deviceCreation);

      // $FlowIKnow deviceCreation.user_key_pair is not null
      const foundUser = await userStore.findUser({ userPublicKey: deviceCreation.user_key_pair.public_encryption_key });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(user);
    });

    it('should find a revoked DeviceCreationV3 by userPublicKey', async () => {
      await userStore.applyEntry(deviceCreation);
      const testDeviceRevocation = testGenerator.makeDeviceRevocation(testUserCreation, testUserCreation.testDevice.id);
      await userStore.applyEntry(testDeviceRevocation.unverifiedDeviceRevocation);

      // $FlowIKnow unverifiedDeviceRevocation.user_keys is not null
      const foundUser = await userStore.findUser({ userPublicKey: testDeviceRevocation.unverifiedDeviceRevocation.user_keys.public_encryption_key });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(testDeviceRevocation.user);
    });

    it('should find a revoked DeviceCreationV3 with an old userPublicKey', async () => {
      await userStore.applyEntry(deviceCreation);
      const testDeviceRevocation = testGenerator.makeDeviceRevocation(testUserCreation, testUserCreation.testDevice.id);
      await userStore.applyEntry(testDeviceRevocation.unverifiedDeviceRevocation);
      // $FlowIKnow deviceCreation.user_key_pair is not null
      const foundUser = await userStore.findUser({ userPublicKey: deviceCreation.user_key_pair.public_encryption_key });
      expect(foundUser).excluding(['_rev', '_id']).to.deep.equal(testDeviceRevocation.user);
    });
  });
});
