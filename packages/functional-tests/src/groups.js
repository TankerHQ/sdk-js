// @flow
import { errors } from '@tanker/core';
import { utils } from '@tanker/crypto';
import { getPublicIdentity, createProvisionalIdentity } from '@tanker/identity';
import { expect, uuid } from '@tanker/test-utils';

import type { TestArgs } from './helpers';

export const generateGroupsTests = (args: TestArgs) => {
  describe('groups', () => {
    let aliceLaptop;
    let alicePublicIdentity;
    let bobLaptop;
    let bobPublicIdentity;
    let charlieLaptop;
    let charliePublicIdentity;
    let unknownPublicIdentity;
    let appHelper;
    const message = "Two's company, three's a crowd";

    before(async () => {
      ({ appHelper } = args);
      const aliceIdentity = await appHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      const bobIdentity = await appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      bobLaptop = args.makeTanker();
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

      const charlieIdentity = await args.appHelper.generateIdentity();
      charliePublicIdentity = await getPublicIdentity(charlieIdentity);
      charlieLaptop = args.makeTanker();
      await charlieLaptop.start(charlieIdentity);
      await charlieLaptop.registerIdentity({ passphrase: 'passphrase' });

      unknownPublicIdentity = await getPublicIdentity(await appHelper.generateIdentity('galette'));
    });

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
        charlieLaptop.stop(),
      ]);
    });

    it('should create a group', async () => {
      await expect(bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity])).to.be.fulfilled;
    });

    it('should add a member to a group', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity]);
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] });
    });

    it('should add two members to a group', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity]);
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity, charliePublicIdentity] });
      const data = 'group sharing party';
      const encryptedData = await aliceLaptop.encrypt(data, { shareWithGroups: [groupId] });
      expect(await bobLaptop.decrypt(encryptedData)).to.equal(data);
      expect(await charlieLaptop.decrypt(encryptedData)).to.equal(data);
    });

    it('should remove a member from a group', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.fulfilled;
    });

    it('should remove two members from a group', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity, charliePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity, charliePublicIdentity] })).to.be.fulfilled;
      const data = 'group sharing party';
      const encryptedData = await aliceLaptop.encrypt(data, { shareWithGroups: [groupId] });
      await expect(bobLaptop.decrypt(encryptedData)).to.be.rejectedWith(errors.InvalidArgument);
      await expect(charlieLaptop.decrypt(encryptedData)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('should remove a member from a group after a first group update', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity, charliePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [charliePublicIdentity] })).to.be.fulfilled;
    });

    it('should add a member to a group twice then remove it', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.fulfilled;
    });

    it('throw when removing a member from a group twice', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('should accept adding duplicate users', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity, bobPublicIdentity] })).to.be.fulfilled;
    });

    it('should accept removing duplicate users', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity, bobPublicIdentity] })).to.be.fulfilled;
    });

    it('throw when removing a member not in the group', async () => {
      const groupId = await bobLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [charliePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws on groupCreation with invalid user', async () => {
      await expect(aliceLaptop.createGroup([alicePublicIdentity, unknownPublicIdentity]))
        .to.be.rejectedWith(errors.InvalidArgument, unknownPublicIdentity);
    });

    it('throws on groupUpdate by adding invalid users', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [unknownPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, unknownPublicIdentity);
    });

    it('throws on groupUpdate by removing invalid users', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [unknownPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws on groupUpdate with invalid group ID', async () => {
      const badGroupID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
      await expect(aliceLaptop.updateGroupMembers(badGroupID, { usersToAdd: [alicePublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, badGroupID);
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

    it('throws on groupUpdate by adding and removing nobody', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [], usersToRemove: [] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'no members to add or remove');
    });

    it('throws on groupUpdate by removing the last member', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [alicePublicIdentity] }))
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

    it('throws when adding and removing the same user', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity], usersToRemove: [bobPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'both added to and removed');
    });

    it('should not share new keys with removed members', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity, charliePublicIdentity]);
      await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] });

      const encrypted = await charlieLaptop.encrypt(message, { shareWithGroups: [groupId] });
      await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('should share new keys with members still in the group after an update', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity, charliePublicIdentity]);
      await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] });

      const encrypted = await aliceLaptop.encrypt(message, { shareWithGroups: [groupId] });
      const decrypted = await charlieLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should share new keys with added group members after a removal', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] });
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [charliePublicIdentity] });
      await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] });

      const encrypted = await aliceLaptop.encrypt(message, { shareWithGroups: [groupId] });
      const decrypted = await charlieLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should share new keys after two group updates', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [charliePublicIdentity], usersToRemove: [bobPublicIdentity] });
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity], usersToRemove: [charliePublicIdentity] });

      const encrypted = await aliceLaptop.encrypt(message, { shareWithGroups: [groupId] });
      await expect(charlieLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);

      const decrypted = await bobLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should share new keys with new members still in the group after an update', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity, charliePublicIdentity] });
      await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [charliePublicIdentity] });
      const encrypted = await aliceLaptop.encrypt(message, { shareWithGroups: [groupId] });

      await expect(charlieLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      const decrypted = await bobLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should be able to decrypt message encrypted before an update', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(message, { shareWithGroups: [groupId] });
      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [charliePublicIdentity], usersToRemove: [bobPublicIdentity] });

      const decrypted = await charlieLaptop.decrypt(encrypted);
      expect(decrypted).to.equal(message);
    });

    it('should not be able to add a user to a group you are not in', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'Current user is not a group member');
    });

    it('should not be able to remove a user to a group you are not in', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(charlieLaptop.updateGroupMembers(groupId, { usersToRemove: [charliePublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'Current user is not a group member');
    });

    it('should not be able to add a user to a group you have been removed from', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await bobLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] });
      await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument);
    });

    it('should not be able to remove a user to a group you have been removed from', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity, charliePublicIdentity]);
      await bobLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] });
      await expect(bobLaptop.updateGroupMembers(groupId, { usersToRemove: [charliePublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument);
    });

    describe('with provisionals', () => {
      let provisionalEmail;
      let provisionalIdentity;
      let provisionalPublicIdentity;
      let provisionalEmail2;
      let provisionalIdentity2;
      let provisionalPublicIdentity2;

      beforeEach(async () => {
        provisionalEmail = `${uuid.v4()}@tanker.io`;
        provisionalIdentity = await createProvisionalIdentity(utils.toBase64(appHelper.appId), provisionalEmail);
        provisionalPublicIdentity = await getPublicIdentity(provisionalIdentity);

        provisionalEmail2 = `${uuid.v4()}@tanker.io`;
        provisionalIdentity2 = await createProvisionalIdentity(utils.toBase64(appHelper.appId), provisionalEmail2);
        provisionalPublicIdentity2 = await getPublicIdentity(provisionalIdentity2);
      });

      it('should add a provisional member to a group twice then remove it', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisionalPublicIdentity] })).to.be.fulfilled;
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisionalPublicIdentity] })).to.be.fulfilled;
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisionalPublicIdentity] })).to.be.fulfilled;
      });

      it('should add duplicate provisional users', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisionalPublicIdentity, provisionalPublicIdentity] })).to.be.fulfilled;
      });

      it('should remove duplicate provisional users', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisionalPublicIdentity]);
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisionalPublicIdentity, provisionalPublicIdentity] })).to.be.fulfilled;
      });

      it('throws when adding and removing the same provisional user', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisionalPublicIdentity]);
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisionalPublicIdentity], usersToRemove: [provisionalPublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'both added to and removed');
      });

      it('fails when creating a group with an already attached provisional identity with no share', async () => {
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        const aliceVerificationCode = await appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode: aliceVerificationCode });

        await expect(bobLaptop.createGroup([provisionalPublicIdentity])).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('fails when creating a group with an already attached provisional identity', async () => {
        await expect(bobLaptop.encrypt(message, { shareWithUsers: [provisionalPublicIdentity] })).to.be.fulfilled;

        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        const aliceVerificationCode = await appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode: aliceVerificationCode });

        await expect(bobLaptop.createGroup([provisionalPublicIdentity])).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('share keys with original provisional group members', async () => {
        const groupId = await bobLaptop.createGroup([provisionalPublicIdentity]);
        const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

        const verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

        expect(await aliceLaptop.decrypt(encrypted)).to.deep.equal(message);
      });

      it('share keys with added provisional group members', async () => {
        const groupId = await bobLaptop.createGroup([bobPublicIdentity]);

        await bobLaptop.updateGroupMembers(groupId, { usersToAdd: [provisionalPublicIdentity] });
        const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

        const verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

        expect(await aliceLaptop.decrypt(encrypted)).to.deep.equal(message);
      });

      it('share keys with two added provisional group members', async () => {
        const groupId = await bobLaptop.createGroup([bobPublicIdentity]);

        await bobLaptop.updateGroupMembers(groupId, { usersToAdd: [provisionalPublicIdentity, provisionalPublicIdentity2] });
        const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

        let verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

        verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail2);
        await charlieLaptop.attachProvisionalIdentity(provisionalIdentity2);
        await charlieLaptop.verifyProvisionalIdentity({ email: provisionalEmail2, verificationCode });

        expect(await aliceLaptop.decrypt(encrypted)).to.deep.equal(message);
        expect(await charlieLaptop.decrypt(encrypted)).to.deep.equal(message);
      });

      it('should update group when claimed provisional users remove a member from group', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisionalPublicIdentity]);

        const verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail);
        await bobLaptop.attachProvisionalIdentity(provisionalIdentity);
        await bobLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

        await bobLaptop.updateGroupMembers(groupId, { usersToRemove: [alicePublicIdentity] });
        const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

        await expect(aliceLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('should not share keys with removed provisional group members', async () => {
        const groupId = await bobLaptop.createGroup([bobPublicIdentity, provisionalPublicIdentity]);
        const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

        await bobLaptop.updateGroupMembers(groupId, { usersToRemove: [provisionalPublicIdentity] });

        const verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

        await expect(aliceLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('should not share keys with two removed provisional group members', async () => {
        const groupId = await bobLaptop.createGroup([bobPublicIdentity, provisionalPublicIdentity, provisionalPublicIdentity2]);
        const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

        await bobLaptop.updateGroupMembers(groupId, { usersToRemove: [provisionalPublicIdentity, provisionalPublicIdentity2] });

        let verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

        verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail2);
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity2);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail2, verificationCode });

        await expect(aliceLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('should fail when removing a claimed provisional user with the provisional identity', async () => {
        const groupId = await bobLaptop.createGroup([bobPublicIdentity, provisionalPublicIdentity]);

        const verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

        await expect(bobLaptop.updateGroupMembers(groupId, { usersToRemove: [provisionalPublicIdentity] })).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('should not share keys with removed claimed provisional group members', async () => {
        const groupId = await bobLaptop.createGroup([bobPublicIdentity, provisionalPublicIdentity]);
        const encrypted = await bobLaptop.encrypt(message, { shareWithGroups: [groupId] });

        const verificationCode = await args.appHelper.getEmailVerificationCode(provisionalEmail);
        await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        await aliceLaptop.verifyProvisionalIdentity({ email: provisionalEmail, verificationCode });

        await bobLaptop.updateGroupMembers(groupId, { usersToRemove: [alicePublicIdentity] });

        await expect(aliceLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });
    });
  });
};
