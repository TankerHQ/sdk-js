// @flow
import uuid from 'uuid';

import { errors } from '@tanker/core';
import { utils } from '@tanker/crypto';
import { getPublicIdentity, createProvisionalIdentity } from '@tanker/identity';
import { expect } from './chai';
import { type TestArgs } from './TestArgs';

const generateGroupsTests = (args: TestArgs) => {
  describe('groups', () => {
    let aliceLaptop;
    let alicePublicIdentity;
    let bobLaptop;
    let bobPublicIdentity;
    let unknownPublicIdentity;
    const message = "Two's company, three's a crowd";

    before(async () => {
      const aliceIdentity = await args.trustchainHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      const bobIdentity = await args.trustchainHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      bobLaptop = args.makeTanker();
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

      unknownPublicIdentity = await getPublicIdentity(await args.trustchainHelper.generateIdentity('galette'));
    });

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
      ]);
    });

    it('should create a group', async () => {
      await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
    });

    it('should add a member to a group', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] })).to.be.fulfilled;
    });

    it('should add a member to a group twice', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] })).to.be.fulfilled;
    });

    it('throws on groupCreation with invalid user', async () => {
      await expect(aliceLaptop.createGroup([alicePublicIdentity, unknownPublicIdentity]))
        .to.be.rejectedWith(errors.InvalidArgument, unknownPublicIdentity);
    });

    it('throws on groupUpdate with invalid users', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [unknownPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, unknownPublicIdentity);
    });

    it('throws on groupUpdate with mix valid/invalid users', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity, unknownPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, unknownPublicIdentity);
    });

    it('throws on groupCreation with empty users', async () => {
      await expect(aliceLaptop.createGroup([]))
        .to.be.rejectedWith(errors.InvalidGroupSize);
    });

    it('throws on groupUpdate with empty users', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [] }))
        .to.be.rejectedWith(errors.InvalidGroupSize);
    });

    it('should publish keys to group', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);

      const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });
      const decrypted = await aliceLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should publish keys to non-local group', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);

      const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });
      const decrypted = await aliceLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should share keys with original group members', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);

      const encrypted = await bobLaptop.encrypt(message);
      const resourceId = await bobLaptop.getResourceId(encrypted);
      await bobLaptop.share([resourceId], { shareWithGroups: [groupId] });

      const decrypted = await aliceLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should share new keys with added group members', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] });

      const encrypted = await aliceLaptop.encrypt(message, { shareWithGroups: [groupId] });
      const decrypted = await bobLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should share old keys with added group members', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(message, { shareWithGroups: [groupId] });
      await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] });

      const decrypted = await bobLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should not be able to update a group you are not in', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument);
    });

    it('create a group with a provisional user', async () => {
      const email = `${uuid.v4()}@tanker-functional-test.io`;
      const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);

      const groupId = await bobLaptop.createGroup([await getPublicIdentity(provisionalIdentity)]);
      const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

      const verificationCode = await args.trustchainHelper.getVerificationCode(email);
      await expect(aliceLaptop.attachProvisionalIdentity(provisionalIdentity)).to.be.fulfilled;
      await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.fulfilled;

      expect(await aliceLaptop.decrypt(encrypted)).to.deep.equal(message);
    });

    it('throws when creating a group with already claimed identity', async () => {
      const email = `${uuid.v4()}@tanker-functional-test.io`;
      const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);
      const publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);
      await bobLaptop.encrypt(message, { shareWithUsers: [publicProvisionalIdentity] });
      const verificationCode = await args.trustchainHelper.getVerificationCode(email);
      await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
      await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

      await expect(bobLaptop.createGroup([bobPublicIdentity, publicProvisionalIdentity])).to.be.rejectedWith(errors.ServerError);
    });

    it('should add a provisional member to a group', async () => {
      const groupId = await bobLaptop.createGroup([bobPublicIdentity]);

      const email = `${uuid.v4()}@tanker-functional-test.io`;
      const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);

      await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [await getPublicIdentity(provisionalIdentity)] })).to.be.fulfilled;
      const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

      const verificationCode = await args.trustchainHelper.getVerificationCode(email);
      await expect(aliceLaptop.attachProvisionalIdentity(provisionalIdentity)).to.be.fulfilled;
      await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.fulfilled;

      expect(await aliceLaptop.decrypt(encrypted)).to.deep.equal(message);
    });

    it('should add a provisional member to a group with a premature verification', async () => {
      const groupId = await bobLaptop.createGroup([bobPublicIdentity]);

      const email = `${uuid.v4()}@tanker-functional-test.io`;
      const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);

      await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [await getPublicIdentity(provisionalIdentity)] })).to.be.fulfilled;
      const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

      await aliceLaptop.encrypt('stuff', { shareWithGroups: [groupId] });

      const verificationCode = await args.trustchainHelper.getVerificationCode(email);
      await expect(aliceLaptop.attachProvisionalIdentity(provisionalIdentity)).to.be.fulfilled;
      await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.fulfilled;

      expect(await aliceLaptop.decrypt(encrypted)).to.deep.equal(message);
    });

    it('throws when adding an already claimed identity', async () => {
      const groupId = await bobLaptop.createGroup([bobPublicIdentity]);
      const email = `${uuid.v4()}@tanker-functional-test.io`;
      const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);
      const publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);
      await bobLaptop.encrypt(message, { shareWithUsers: [publicProvisionalIdentity] });
      const verificationCode = await args.trustchainHelper.getVerificationCode(email);
      await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
      await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

      await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [publicProvisionalIdentity] })).to.be.rejectedWith(errors.ServerError);
    });

    it('should claim a group creation, a group add, and an encrypt', async () => {
      const email = `${uuid.v4()}@tanker-functional-test.io`;
      const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.trustchainHelper.trustchainId), email);
      const publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);
      const groupId1 = await bobLaptop.createGroup([bobPublicIdentity]);
      const groupId2 = await bobLaptop.createGroup([bobPublicIdentity, publicProvisionalIdentity]);

      await expect(bobLaptop.updateGroupMembers(groupId1, { usersToAdd: [publicProvisionalIdentity] })).to.be.fulfilled;
      const encrypted1 = await bobLaptop.encrypt(message, { shareWithGroups: [groupId1] });
      const encrypted2 = await bobLaptop.encrypt(message, { shareWithGroups: [groupId2] });
      const encrypted3 = await bobLaptop.encrypt(message, { shareWithUsers: [publicProvisionalIdentity] });

      const verificationCode = await args.trustchainHelper.getVerificationCode(email);
      await expect(aliceLaptop.attachProvisionalIdentity(provisionalIdentity)).to.be.fulfilled;
      await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.fulfilled;

      expect(await aliceLaptop.decrypt(encrypted1)).to.deep.equal(message);
      expect(await aliceLaptop.decrypt(encrypted2)).to.deep.equal(message);
      expect(await aliceLaptop.decrypt(encrypted3)).to.deep.equal(message);
    });
  });
};

export default generateGroupsTests;
