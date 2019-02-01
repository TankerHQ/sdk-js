// @flow
/* eslint-disable no-underscore-dangle */

import { tcrypto, random, utils } from '@tanker/crypto';

import { expect } from './chai';
import Generator from './Generator';

import { blockToEntry } from '../Blocks/entries';
import { type UserDeviceRecord, unserializePayload } from '../Blocks/payloads';
import { isKeyPublishToDevice, isPendingKeyPublish, isDeviceCreation, isDeviceRevocation, NATURE, isTrustchainCreation } from '../Blocks/Nature';

describe('trustchain-generator', () => {
  let generator;
  let trustchainKeys;

  beforeEach(async () => {
    trustchainKeys = tcrypto.makeSignKeyPair();
    generator = await Generator.open(trustchainKeys);
  });

  it('should only have a root block upon creation', async () => {
    expect(generator.pushedBlocks.length).to.equal(1);
    const rootBlock = blockToEntry(generator.pushedBlocks[0]);
    expect(isTrustchainCreation(rootBlock.nature)).to.true;
    expect(utils.equalArray(rootBlock.signature, new Uint8Array(tcrypto.SIGNATURE_SIZE))).to.equal(true);
  });

  it('should add a user given a userId', async () => {
    await generator.newUserCreationV3('47');

    expect(generator.pushedBlocks.length).to.equal(2);
    expect(Object.keys(generator.users)).to.have.a.lengthOf(1);
    expect(generator.users['47'].devices).to.have.a.lengthOf(1);

    const userAddBlock = blockToEntry(generator.pushedBlocks[generator.pushedBlocks.length - 1]);
    const userAddBlockPayload: UserDeviceRecord = (userAddBlock.payload_unverified: any);
    const delegationBuffer = utils.concatArrays(userAddBlockPayload.ephemeral_public_signature_key, userAddBlockPayload.user_id);

    expect(isDeviceCreation(userAddBlock.nature)).to.be.true;
    expect(tcrypto.verifySignature(delegationBuffer, userAddBlockPayload.delegation_signature, trustchainKeys.publicKey)).to.equal(true);
    expect(tcrypto.verifySignature(userAddBlock.hash, userAddBlock.signature, userAddBlockPayload.ephemeral_public_signature_key)).to.equal(true);
    expect(userAddBlockPayload.public_signature_key).to.deep.equal(generator.users['47'].devices[0].signKeys.publicKey);
  });

  it('should refuse to add an existing user', async () => {
    await generator.newUserCreationV3('47');
    await expect(generator.newUserCreationV3('47')).to.be.rejected;
  });

  it('should allow when using unsafe to add an existing user', async () => {
    await generator.newUserCreationV3('47');
    await generator.newUserCreationV3('47', { unsafe: true });
    expect(generator.pushedBlocks.length).to.equal(3);
  });

  it('should refuse to add a device when parentDeviceIndex is out of bounds', async () => {
    await generator.newUserCreationV3('47');
    await expect(generator.newDeviceCreationV3({ userId: '47', parentIndex: 2 })).to.be.rejected;
  });

  it('should refuse to add a device when userId does not exist', async () => {
    await generator.newUserCreationV3('47');
    await expect(generator.newDeviceCreationV3({ userId: 'Dana', parentIndex: 0 })).to.be.rejected;
  });

  it('should add a device when correct arguments are provided', async () => {
    await generator.newUserCreationV3('47');
    const deviceAddBlock = (await generator.newDeviceCreationV3({ userId: '47', parentIndex: 0 })).entry;
    const deviceAddBlockPayload: UserDeviceRecord = (deviceAddBlock.payload_unverified: any);
    const parentDevice = generator.users['47'].devices[0];

    const { signature } = deviceAddBlock;
    const { publicKey } = parentDevice.signKeys;

    const delegationBuffer = utils.concatArrays(deviceAddBlockPayload.ephemeral_public_signature_key, deviceAddBlockPayload.user_id);

    expect(isDeviceCreation(deviceAddBlock.nature)).to.be.true;
    expect(generator.users['47'].devices[1].id).to.deep.equal(deviceAddBlock.hash);
    expect(tcrypto.verifySignature(delegationBuffer, deviceAddBlockPayload.delegation_signature, publicKey)).to.equal(true);
    expect(tcrypto.verifySignature(deviceAddBlock.hash, signature, deviceAddBlockPayload.ephemeral_public_signature_key)).to.equal(true);
  });

  it('should add a key publish', async () => {
    await generator.newUserCreationV3('47');
    await generator.newDeviceCreationV3({ userId: '47', parentIndex: 0 });
    await generator.newDeviceCreationV3({ userId: '47', parentIndex: 1 });
    const firstDevice = generator.users['47'].devices[0];
    const secondDevice = generator.users['47'].devices[1];

    const args = {
      symmetricKey: random(tcrypto.SYMMETRIC_KEY_SIZE),
      resourceId: random(tcrypto.MAC_SIZE),
      fromDevice: firstDevice,
      toDevice: secondDevice
    };

    const { block: keyPublishBlock, entry: keyPublishEntry } = await generator.newKeyPublishToDevice(args);

    expect(isKeyPublishToDevice(keyPublishEntry.nature)).to.be.true;
    expect(tcrypto.verifySignature(
      keyPublishEntry.hash,
      keyPublishBlock.signature,
      firstDevice.signKeys.publicKey
    )).to.equal(true);
  });

  it('should not be able to add a key publish to user on a user V1', async () => {
    await generator.newUserCreationV1('user47');
    const recipient = await generator.newUserCreationV1('user48');
    const firstDevice = generator.users.user47.devices[0];

    const args = {
      symmetricKey: random(tcrypto.SYMMETRIC_KEY_SIZE),
      resourceId: random(tcrypto.MAC_SIZE),
      fromDevice: firstDevice,
      toUser: recipient.user
    };

    await expect(generator.newKeyPublishToUser(args)).to.be.rejected;
  });

  it('should add a key publish to invitee', async () => {
    await generator.newUserCreationV3('47');
    await generator.newDeviceCreationV3({ userId: '47', parentIndex: 0 });
    const firstDevice = generator.users['47'].devices[0];

    const args = {
      symmetricKey: random(tcrypto.SYMMETRIC_KEY_SIZE),
      resourceId: random(tcrypto.MAC_SIZE),
      toInvitePublicKey: {
        app_public_key: random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
        tanker_public_key: random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
      },
      fromDevice: firstDevice,
    };

    const { block: keyPublishBlock, entry: keyPublishEntry } = await generator.newPendingKeyPublish(args);

    expect(isPendingKeyPublish(keyPublishEntry.nature)).to.be.true;
    expect(tcrypto.verifySignature(
      keyPublishEntry.hash,
      keyPublishBlock.signature,
      firstDevice.signKeys.publicKey
    )).to.equal(true);
  });

  it('should revoke a device', async () => {
    await generator.newUserCreationV3('47');
    await generator.newDeviceCreationV3({ userId: '47', parentIndex: 0 });
    await generator.newDeviceCreationV3({ userId: '47', parentIndex: 1 });
    const firstDevice = generator.users['47'].devices[0];
    const secondDevice = generator.users['47'].devices[1];

    const { block: revocationBlock, entry: revocationEntry } = await generator.newDeviceRevocationV2(firstDevice, secondDevice);

    expect(isDeviceRevocation(revocationEntry.nature)).to.be.true;
    expect(revocationEntry.author).to.equal(firstDevice.id);
    expect(tcrypto.verifySignature(
      revocationEntry.hash,
      revocationBlock.signature,
      firstDevice.signKeys.publicKey
    )).to.equal(true);
  });

  it('should be able to add a user through user creationV1', async () => {
    const firstDeviceBlock = (await generator.newUserCreationV1('user47')).block;
    expect(generator.pushedBlocks.length).to.equal(2);
    expect(Object.keys(generator.users)).to.have.a.lengthOf(1);
    expect(generator.users.user47.devices).to.have.a.lengthOf(1);
    expect(firstDeviceBlock.nature).to.equal(NATURE.device_creation_v1);
    const userRecord = unserializePayload(firstDeviceBlock);
    // $FlowExpectedError userRecord is expected to be a UserDeviceRecord here.
    expect(userRecord.user_key_pair).to.be.null;
  });

  it('should refuse to revoke a Device V3 with a DR1', async () => {
    await generator.newUserCreationV3('user47');
    await generator.newDeviceCreationV3({ userId: 'user47', parentIndex: 1 });
    const firstDevice = generator.users.user47.devices[0];
    const secondDevice = generator.users.user47.devices[1];
    await expect(generator.newDeviceRevocationV1(firstDevice, secondDevice)).to.be.rejected;
  });

  it('should not be able to add a device creation V3 on a user V1', async () => {
    await generator.newUserCreationV1('user47');
    await expect(generator.newDeviceCreationV3({ userId: 'user47', parentIndex: 1 })).to.be.rejected;
  });

  it('should be able to add a device creation V1 to an user V1', async () => {
    await generator.newUserCreationV1('user47');
    const device = await generator.newDeviceCreationV1({ userId: 'user47', parentIndex: 1 });
    expect(generator.pushedBlocks.length).to.equal(3);
    expect(Object.keys(generator.users)).to.have.a.lengthOf(1);
    expect(generator.users.user47.devices).to.have.a.lengthOf(2);
    expect(device.block.nature).to.equal(NATURE.device_creation_v1);
    const userRecord = unserializePayload(device.block);
    // $FlowExpectedError userRecord is expected to be a UserDeviceRecord here.
    expect(userRecord.user_key_pair).to.be.null;
  });

  it('should be able to revoke a Device V1 with a DR1', async () => {
    await generator.newUserCreationV1('user47');
    await generator.newDeviceCreationV1({ userId: 'user47', parentIndex: 1 });
    const firstDevice = generator.users.user47.devices[0];
    const secondDevice = generator.users.user47.devices[1];

    const { block: revocationBlock, entry: revocationEntry } = await generator.newDeviceRevocationV1(firstDevice, secondDevice);

    expect(revocationBlock.nature).to.equal(NATURE.device_revocation_v1);
    expect(revocationEntry.author).to.equal(firstDevice.id);
    expect(tcrypto.verifySignature(
      revocationEntry.hash,
      revocationBlock.signature,
      firstDevice.signKeys.publicKey
    )).to.equal(true);
  });
});
