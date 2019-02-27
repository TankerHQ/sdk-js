// @flow
import uuid from 'uuid';

import { errors } from '@tanker/core';
import { expect } from './chai';
import { type TestArgs } from './TestArgs';

const generateGroupsTests = (args: TestArgs) => {
  describe('groups', () => {
    let aliceId;
    let bobId;
    const message = "Two's company, three's a crowd";

    before(async () => {
      aliceId = uuid.v4();
      const aliceIdentity = args.trustchainHelper.generateIdentity(aliceId);
      await args.aliceLaptop.open(aliceIdentity);

      bobId = uuid.v4();
      const bobIdentity = args.trustchainHelper.generateIdentity(bobId);
      await args.bobLaptop.open(bobIdentity);
    });

    after(async () => {
      await Promise.all([
        args.aliceLaptop.close(),
        args.bobLaptop.close(),
        args.bobPhone.close(),
      ]);
    });

    it('should create a group', async () => {
      await args.bobLaptop.createGroup([aliceId, bobId]);
    });

    it('should add a member to a group', async () => {
      const groupId = await args.bobLaptop.createGroup([aliceId]);
      await args.aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobId] });
      // FIXME no asserts wtf
    });

    it('should add a member to a group twice', async () => {
      const groupId = await args.bobLaptop.createGroup([aliceId]);
      await args.aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobId] });
      await args.aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobId] });
      // FIXME no asserts wtf
    });

    it('throws on groupCreation with invalid user', async () => {
      const whereAreYou = ['galette', 'saucisse'];

      await expect(args.aliceLaptop.createGroup([aliceId, ...whereAreYou]))
        .to.be.rejectedWith(errors.RecipientsNotFound)
        .and.eventually.have.property('recipientIds').to.deep.equal(whereAreYou);
    });

    it('throws on groupUpdate with invalid users', async () => {
      const whereAreYou = ['galette', 'saucisse'];

      const groupId = await args.aliceLaptop.createGroup([aliceId]);

      await expect(args.aliceLaptop.updateGroupMembers(groupId, { usersToAdd: whereAreYou }))
        .to.be.rejectedWith(errors.RecipientsNotFound)
        .and.eventually.have.property('recipientIds').to.deep.equal(whereAreYou);
    });

    it('throws on groupUpdate with mix valid/invalid users', async () => {
      const whereAreYou = ['galette', 'saucisse'];

      const groupId = await args.aliceLaptop.createGroup([aliceId]);

      await expect(args.aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobId, ...whereAreYou] }))
        .to.be.rejectedWith(errors.RecipientsNotFound)
        .and.eventually.have.property('recipientIds').to.deep.equal(whereAreYou);
    });

    it('throws on groupCreation with empty users', async () => {
      await expect(args.aliceLaptop.createGroup([]))
        .to.be.rejectedWith(errors.InvalidGroupSize);
    });

    it('throws on groupUpdate with empty users', async () => {
      const groupId = await args.aliceLaptop.createGroup([aliceId]);

      await expect(args.aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [] }))
        .to.be.rejectedWith(errors.InvalidGroupSize);
    });

    it('should publish keys to group', async () => {
      const groupId = await args.bobLaptop.createGroup([aliceId, bobId]);

      const encrypted = await args.bobLaptop.encrypt(message, { shareWithGroups: [groupId] }); const decrypted = await args.aliceLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should publish keys to non-local group', async () => {
      const groupId = await args.aliceLaptop.createGroup([aliceId]);

      const encrypted = await args.bobLaptop.encrypt(message, { shareWithGroups: [groupId] }); const decrypted = await args.aliceLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should share keys to group', async () => {
      const groupId = await args.aliceLaptop.createGroup([aliceId]);

      const encrypted = await args.bobLaptop.encrypt(message);
      const resourceId = await args.bobLaptop.getResourceId(encrypted);
      await args.bobLaptop.share([resourceId], { shareWithGroups: [groupId] });

      const decrypted = await args.aliceLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should publish keys to updated group', async () => {
      const groupId = await args.aliceLaptop.createGroup([aliceId]);
      await args.aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobId] });

      const encrypted = await args.aliceLaptop.encrypt(message, { shareWithGroups: [groupId] }); const decrypted = await args.bobLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should publish old keys to new group member', async () => {
      const groupId = await args.aliceLaptop.createGroup([aliceId]);
      const encrypted = await args.aliceLaptop.encrypt(message, { shareWithGroups: [groupId] }); await expect(args.bobLaptop.decrypt(encrypted))
        .to.be.rejectedWith(errors.ResourceNotFound);
      await args.aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobId] });

      const decrypted = await args.bobLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should not be able to update a group you are not in', async () => {
      const groupId = await args.aliceLaptop.createGroup([aliceId]);
      await expect(args.bobLaptop.updateGroupMembers(groupId, { usersToAdd: [bobId] }))
        .to.be.rejectedWith(errors.InvalidArgument);
    });
  });
};

export default generateGroupsTests;
