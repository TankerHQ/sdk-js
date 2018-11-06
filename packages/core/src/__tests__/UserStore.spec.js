// @flow
import find from 'array-find';
import { utils } from '@tanker/crypto';

import { expect } from './chai';
import { type User, getLastUserPublicKey } from '../Users/UserStore';

import { type GeneratorUserResult } from './Generator';
import { type UserDeviceRecord, type DeviceRevocationRecord } from '../Blocks/payloads';

import { makeUserStoreBuilder, forgeVerifiedEntry } from './UserStoreBuilder';


function expectHasDevice(user: User, reference: GeneratorUserResult) {
  expect(user.devices).to.have.lengthOf.above(0);
  const refDeviceId = utils.toBase64(reference.entry.hash);
  for (const userDev of user.devices) {
    if (userDev.deviceId === refDeviceId) {
      expect(userDev.createdAt).to.equal(reference.entry.index);
      expect(utils.equalArray(userDev.devicePublicEncryptionKey, reference.device.encryptionKeys.publicKey)).to.be.true;
      return;
    }
  }
  throw new Error(`Cannot find device: ${refDeviceId}`);
}

function expectHasOnlyDevices(user: User, references: Array<GeneratorUserResult>) {
  expect(user.devices).to.have.lengthOf(references.length);

  for (const ref of references) {
    expectHasDevice(user, ref);
  }
}

function expectHasUserKey(user: User, reference: GeneratorUserResult, index: number) {
  if (!reference.user.userKeys)
    throw new Error('userKeys should not be null');
  expect(user.userPublicKeys.length).to.not.equal(0);
  // $FlowIKnow
  expect(getLastUserPublicKey(user)).to.deep.equal(reference.user.userKeys.publicKey);
  expect(user.userPublicKeys.slice(-1)[0].index).equal(index);
}

function expectHasNoUserKey(user: User) {
  expect(user.userPublicKeys.length).to.equal(0);
}

function expectRevokedDeviceAt(user: User, deviceId: Uint8Array, revokedIndex: number) {
  if (revokedIndex === Number.MAX_SAFE_INTEGER)
    throw new Error('invalid revokedIndex for test assertion');
  const b64DeviceId = utils.toBase64(deviceId);
  const device = find(user.devices, d => d.deviceId === b64DeviceId);
  if (!device)
    throw new Error('Could not find device');
  expect(device.revokedAt).to.equal(revokedIndex);
}

function expectActiveDevice(user: User, deviceId: Uint8Array) {
  const b64DeviceId = utils.toBase64(deviceId);
  const device = find(user.devices, d => d.deviceId === b64DeviceId);
  if (!device)
    throw new Error('Could not find device');
  expect(device.revokedAt).to.equal(Number.MAX_SAFE_INTEGER);
}

describe('UserStore', () => {
  describe('applyEntry', () => {
    it('throws on invalid nature', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');
      const bob = await generator.newUserCreationV3('bob');
      const entry = await generator.newKeyPublishToUser({ fromDevice: alice.device, toUser: bob.user });

      const promise = userStore.applyEntry(entry);

      await expect(promise).to.be.rejected;
    });
  });

  describe('DeviceCreation', () => {
    it('applies and finds a DeviceCreationV1 (device key)', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV1('alice');

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      const user = await userStore.findUser({ userId: alice.entry.user_id });

      expectHasOnlyDevices(user, [alice]);
      expectHasNoUserKey(user);
    });

    it('applies and finds a DeviceCreationV3 (user key)', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      const user = await userStore.findUser({ userId: alice.entry.user_id });

      expectHasOnlyDevices(user, [alice]);
      expectHasUserKey(user, alice, alice.entry.index);
    });

    it('applies and finds multiples DeviceCreationV1 (device keys)', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV1('alice');
      const alice1 = await generator.newDeviceCreationV1({ userId: 'alice', parentIndex: 0 });
      const alice2 = await generator.newDeviceCreationV1({ userId: 'alice', parentIndex: 1 });

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      await userStore.applyEntry(forgeVerifiedEntry(alice1.entry));
      await userStore.applyEntry(forgeVerifiedEntry(alice2.entry));
      const user = await userStore.findUser({ userId: alice.entry.user_id });

      expectHasOnlyDevices(user, [alice, alice1, alice2]);
      expectHasNoUserKey(user);
    });

    it('applies and finds multiples DeviceCreationV3 (user keys)', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');
      const alice1 = await generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });
      const alice2 = await generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 1 });

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      await userStore.applyEntry(forgeVerifiedEntry(alice1.entry));
      await userStore.applyEntry(forgeVerifiedEntry(alice2.entry));
      const user = await userStore.findUser({ userId: alice.entry.user_id });

      expectHasOnlyDevices(user, [alice, alice1, alice2]);
      expectHasUserKey(user, alice2, alice.entry.index);
    });
  });

  describe('DeviceRevocation', () => {
    it('applies and finds a DeviceRevocationV1 (on device V1)', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV1('alice');
      const revocation = await generator.newDeviceRevocationV1(alice.device, { id: alice.device.id });

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      await userStore.applyEntry(forgeVerifiedEntry(revocation.entry));
      const user = await userStore.findUser({ userId: alice.entry.user_id });

      expectHasOnlyDevices(user, [alice]);
      expectHasNoUserKey(user);
      expectRevokedDeviceAt(user, alice.device.id, revocation.block.index);
    });

    it('changes userPublicKeys after DeviceRevocationV2 (on device V3)', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');
      const aliceFirstKey = new Uint8Array(alice.user.userKeys.publicKey);
      const revocation = await generator.newDeviceRevocationV2(alice.device, { id: alice.device.id });

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      await userStore.applyEntry(forgeVerifiedEntry(revocation.entry));
      const { userPublicKeys: userKeys } = await userStore.findUser({ userId: alice.entry.user_id });

      expect(userKeys.length).to.equal(2);
      expect(userKeys[0]).to.deep.equal({ index: alice.entry.index, userPublicKey: aliceFirstKey });
      expect(userKeys[1]).to.deep.equal({ index: revocation.entry.index, userPublicKey: revocation.user.userKeys.publicKey });
    });

    it('applies and finds a DeviceRevocationV2 (on device V3)', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');
      const revocation = await generator.newDeviceRevocationV2(alice.device, { id: alice.device.id });

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      await userStore.applyEntry(forgeVerifiedEntry(revocation.entry));
      const user = await userStore.findUser({ userId: alice.entry.user_id });

      expectHasOnlyDevices(user, [alice]);
      expectHasUserKey(user, revocation, revocation.entry.index);
      expectRevokedDeviceAt(user, alice.device.id, revocation.block.index);
    });

    it('DeviceRevocations are only applied to the right device', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV1('alice');
      const alice1 = await generator.newDeviceCreationV1({ userId: 'alice', parentIndex: 0 });
      const alice2 = await generator.newDeviceCreationV1({ userId: 'alice', parentIndex: 1 });
      const revocation = await generator.newDeviceRevocationV1(alice1.device, { id: alice1.device.id });

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      await userStore.applyEntry(forgeVerifiedEntry(alice1.entry));
      await userStore.applyEntry(forgeVerifiedEntry(alice2.entry));
      await userStore.applyEntry(forgeVerifiedEntry(revocation.entry));
      const user = await userStore.findUser({ userId: alice.entry.user_id });

      expectHasOnlyDevices(user, [alice, alice1, alice2]);
      expectHasNoUserKey(user);
      expectActiveDevice(user, alice.device.id);
      expectRevokedDeviceAt(user, alice1.device.id, revocation.block.index);
      expectActiveDevice(user, alice2.device.id);
    });
  });

  describe('Find by deviceId', () => {
    it('finds a DeviceCreationV1 with findDeviceToUser', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV1('alice');

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      const deviceToUser = await userStore._findDeviceToUser({ deviceId: alice.entry.hash }); // eslint-disable-line no-underscore-dangle

      expect(utils.equalArray(utils.fromBase64(deviceToUser.userId), alice.entry.user_id)).to.be.true;
    });

    it('finds a DeviceCreationV3 with findDeviceToUser', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      const deviceToUser = await userStore._findDeviceToUser({ deviceId: alice.entry.hash }); // eslint-disable-line no-underscore-dangle

      expect(utils.equalArray(utils.fromBase64(deviceToUser.userId), alice.entry.user_id)).to.be.true;
    });

    it('finds a DeviceCreationV1 with findDevice', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV1('alice');

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      const device = await userStore.findDevice({ deviceId: alice.entry.hash });

      expect(utils.equalArray(utils.fromBase64(device.deviceId), alice.entry.hash)).to.be.true;
      expect(device.revokedAt).equal(Number.MAX_SAFE_INTEGER);
    });

    it('finds a DeviceCreationV3 with findDevice', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      const device = await userStore.findDevice({ deviceId: alice.entry.hash });

      expect(utils.equalArray(utils.fromBase64(device.deviceId), alice.entry.hash)).to.be.true;
      expect(device.revokedAt).equal(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Find by userPublicKey', () => {
    it('find a DeviceCreationV3 by userPublicKey', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');
      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      const payload = ((alice.entry.payload_unverified: any): UserDeviceRecord);
      if (!payload.user_key_pair)
        throw new Error('payload should have a user key pair here');
      const user = await userStore.findUser({ userPublicKey: payload.user_key_pair.public_encryption_key });

      expectHasOnlyDevices(user, [alice]);
      expectHasUserKey(user, alice, alice.entry.index);
      expect(user.userPublicKeys.length).to.equal(1);
    });

    it('should find a revoked DeviceCreationV3 by userPublicKey', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');
      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      const revocation = await generator.newDeviceRevocationV2(alice.device, alice.device);
      await userStore.applyEntry(forgeVerifiedEntry(revocation.entry));
      const payload = ((revocation.entry.payload_unverified: any): DeviceRevocationRecord);
      if (!payload.user_keys)
        throw new Error('payload should have a user key pair here');

      const user = await userStore.findUser({ userPublicKey: payload.user_keys.public_encryption_key });

      expectHasOnlyDevices(user, [alice]);
      expect(user.userPublicKeys.length).to.equal(2);
    });

    it('should find a revoked DeviceCreationV3 with an old userPublicKey', async () => {
      const { generator, userStore } = await makeUserStoreBuilder();
      const alice = await generator.newUserCreationV3('alice');
      const revocation = await generator.newDeviceRevocationV2(alice.device, alice.device);

      await userStore.applyEntry(forgeVerifiedEntry(alice.entry));
      await userStore.applyEntry(forgeVerifiedEntry(revocation.entry));

      const payload = ((alice.entry.payload_unverified: any): UserDeviceRecord);
      if (!payload.user_key_pair)
        throw new Error('payload should have a user key pair here');
      const user = await userStore.findUser({ userPublicKey: payload.user_key_pair.public_encryption_key });

      expectHasOnlyDevices(user, [alice]);
      expect(user.userPublicKeys.length).to.equal(2);
    });
  });
});
