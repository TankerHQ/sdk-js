// @flow
/* eslint-disable no-underscore-dangle */

import { tcrypto, utils } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import Generator from './Generator';

import { blockToEntry } from '../Blocks/entries';
import { type UserDeviceRecord } from '../Blocks/payloads';
import { isDeviceCreation, isTrustchainCreation } from '../Blocks/Nature';

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
});
