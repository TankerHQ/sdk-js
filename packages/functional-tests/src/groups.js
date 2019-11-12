// @flow
import { errors } from '@tanker/core';
import { utils } from '@tanker/crypto';
import { getPublicIdentity, createProvisionalIdentity } from '@tanker/identity';
import { expect, uuid } from '@tanker/test-utils';

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
      const aliceIdentity = await args.appHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      const bobIdentity = await args.appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      bobLaptop = args.makeTanker();
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

      unknownPublicIdentity = await getPublicIdentity(await args.appHelper.generateIdentity('galette'));
    });

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
      ]);
    });

    it('should create a group', async () => {
      await expect(bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity])).to.be.fulfilled;
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
        .to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws on groupUpdate with empty users', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [] }))
        .to.be.rejectedWith(errors.InvalidArgument);
    });

    it('should publish keys to group', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);

      const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });
      const decrypted = await aliceLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should publish keys to a group you do not belong to', async () => {
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

    it('share keys with original provisional group members', async () => {
      const provisionalEmail = `${uuid.v4()}@tanker-functional-test.io`;
      const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.appHelper.appId), provisionalEmail);
      const provisionalPublicIdentity = await getPublicIdentity(provisionalIdentity);

      const groupId = await bobLaptop.createGroup([provisionalPublicIdentity]);
      const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

      const verificationCode = await args.appHelper.getVerificationCode(provisionalEmail);
      await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
      await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

      expect(await aliceLaptop.decrypt(encrypted)).to.deep.equal(message);
    });

    it('share keys with added provisional group members', async () => {
      const provisionalEmail = `${uuid.v4()}@tanker-functional-test.io`;
      const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(args.appHelper.appId), provisionalEmail);
      const provisionalPublicIdentity = await getPublicIdentity(provisionalIdentity);

      const groupId = await bobLaptop.createGroup([bobPublicIdentity]);

      await bobLaptop.updateGroupMembers(groupId, { usersToAdd: [provisionalPublicIdentity] });
      const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

      const verificationCode = await args.appHelper.getVerificationCode(provisionalEmail);
      await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
      await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

      expect(await aliceLaptop.decrypt(encrypted)).to.deep.equal(message);
    });
  });
};

export default generateGroupsTests;
