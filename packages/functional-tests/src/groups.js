// @flow
import { errors } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import { type TestArgs, expectDecrypt } from './helpers';

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
    const clearText = "Two's company, three's a crowd";

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

    it('creates a group and encrypts for it', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId], shareWithSelf: false });

      await expectDecrypt([aliceLaptop, bobLaptop], clearText, encrypted);
    });

    it('encrypts for two groups', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      const groupId2 = await aliceLaptop.createGroup([alicePublicIdentity, charliePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId, groupId2] });

      await expectDecrypt([bobLaptop, charlieLaptop], clearText, encrypted);
    });

    it('encrypts for a non-cached group', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      const encrypted = await charlieLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await expectDecrypt([aliceLaptop], clearText, encrypted);
    });

    it('should create a group, encrypt and then share with it', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText);
      const resourceId = await aliceLaptop.getResourceId(encrypted);
      await aliceLaptop.share([resourceId], { shareWithGroups: [groupId] });

      await expectDecrypt([bobLaptop], clearText, encrypted);
    });

    it('should encrypt and then share with two groups', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      const groupId2 = await aliceLaptop.createGroup([alicePublicIdentity, charliePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText);
      const resourceId = await aliceLaptop.getResourceId(encrypted);
      await aliceLaptop.share([resourceId], { shareWithGroups: [groupId, groupId2] });

      await expectDecrypt([bobLaptop, charlieLaptop], clearText, encrypted);
    });

    it('throws on groupCreation with empty users', async () => {
      await expect(aliceLaptop.createGroup([]))
        .to.be.rejectedWith(errors.InvalidArgument);
    });

    it('should not keep the key if we are not part of the group', async () => {
      const groupId = await aliceLaptop.createGroup([bobPublicIdentity]);

      // This assertion is needed to satisfy flow because _session is optional
      // eslint-disable-next-line no-underscore-dangle
      if (!aliceLaptop._session)
        throw new Error('_session cannot be null');

      // We can't assert this with decrypt because the server will not send the
      // key publish. This is the only way I have found to assert that.
      // eslint-disable-next-line no-underscore-dangle
      await expect(aliceLaptop._session._storage.groupStore._findGroupsByGroupId([groupId])).to.eventually.deep.equal([]);
    });

    it('should add a member to a group', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] });

      // Also test resources shared after the group add
      const encrypted2 = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await expectDecrypt([bobLaptop], clearText, encrypted);
      await expectDecrypt([bobLaptop], clearText, encrypted2);
    });

    it('should add two members to a group', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity, charliePublicIdentity] });

      await expectDecrypt([bobLaptop, charlieLaptop], clearText, encrypted);
    });

    it('should remove a member from a group', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity, charliePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.fulfilled;

      const encrypted2 = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      // Bob was removed, he can't decrypt or update the group anymore
      await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      await expect(bobLaptop.decrypt(encrypted2)).to.be.rejectedWith(errors.InvalidArgument);
      await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'You are not a member');
      await expect(bobLaptop.updateGroupMembers(groupId, { usersToRemove: [charliePublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'You are not a member');

      // Charlie was not removed, he should still be able to decrypt
      await expectDecrypt([charlieLaptop], clearText, encrypted);
      await expectDecrypt([charlieLaptop], clearText, encrypted2);
    });

    it('should remove two members from a group', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity, charliePublicIdentity]);
      const encryptedData = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity, charliePublicIdentity] })).to.be.fulfilled;

      await expect(bobLaptop.decrypt(encryptedData)).to.be.rejectedWith(errors.InvalidArgument);
      await expect(charlieLaptop.decrypt(encryptedData)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('should allow access to resources when adding back a member', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] });

      // Bob was removed, he can't decrypt anymore
      await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);

      await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] });

      // Bob was added back, he can decrypt
      await expectDecrypt([bobLaptop], clearText, encrypted);
    });

    it('removes two group members', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity, charliePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [charliePublicIdentity] })).to.be.fulfilled;

      await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      await expect(charlieLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('should add a member to a group twice then remove it', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.fulfilled;

      await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws when removing a member from a group twice', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.fulfilled;
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, 'Some users are not part of this group');
    });

    it('should accept adding duplicate users', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity, bobPublicIdentity] })).to.be.fulfilled;

      await expectDecrypt([bobLaptop], clearText, encrypted);
    });

    it('should accept removing duplicate users', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity, bobPublicIdentity] })).to.be.fulfilled;

      await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws when removing a member not in the group', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [charliePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, 'Some users are not part of this group');
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
        .to.be.rejectedWith(errors.InvalidArgument, 'Some users are not part of this group');
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

    it('throws on groupUpdate by adding and removing nobody', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [], usersToRemove: [] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'no members to add or remove');
    });

    it('throws on groupUpdate by removing the last member', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);

      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [alicePublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'removing all members');
    });

    it('throws when adding and removing the same user', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity], usersToRemove: [bobPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'both added to and removed');
    });

    it('should not be able to add a user to a group you are not in', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
      await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'Current user is not a group member');
    });

    it('should not be able to remove a user from a group you are not in', async () => {
      const groupId = await aliceLaptop.createGroup([alicePublicIdentity, bobPublicIdentity]);
      await expect(charlieLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] }))
        .to.be.rejectedWith(errors.InvalidArgument, 'Current user is not a group member');
    });

    describe('with provisionals', () => {
      let provisional;
      let provisional2;

      beforeEach(async () => {
        provisional = await appHelper.generateEmailProvisionalIdentity();
        provisional2 = await appHelper.generateEmailProvisionalIdentity();
      });

      it('creates a group with provisional members', async () => {
        const groupId = await aliceLaptop.createGroup([provisional.publicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);

        await expectDecrypt([bobLaptop], clearText, encrypted);
      });

      it('adds provisional members to a group', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisional.publicIdentity] });

        const encrypted2 = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        await expectDecrypt([bobLaptop], clearText, encrypted);
        await expectDecrypt([bobLaptop], clearText, encrypted2);
      });

      it('adds two provisional members to a group', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisional.publicIdentity, provisional2.publicIdentity] });

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        await appHelper.attachVerifyProvisionalIdentity(charlieLaptop, provisional2);

        await expectDecrypt([bobLaptop, charlieLaptop], clearText, encrypted);
      });

      it('removes a provisional member from a group', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, charliePublicIdentity, provisional.publicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisional.publicIdentity] });

        const encrypted2 = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        // provisional was removed so Bob can't decrypt even after the claim
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
        await expect(bobLaptop.decrypt(encrypted2)).to.be.rejectedWith(errors.InvalidArgument);
        await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [charliePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, 'You are not a member of this group');

        // Charlie is still part of the group and can decrypt
        await expectDecrypt([charlieLaptop], clearText, encrypted);
        await expectDecrypt([charlieLaptop], clearText, encrypted2);
      });

      it('removes two provisional members from a group', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisional.publicIdentity, provisional2.publicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisional.publicIdentity, provisional2.publicIdentity] });

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional2);
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('should allow access to resources when adding back a member as a provisional identity', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisional.publicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisional.publicIdentity] });

        // Bob was never added, he can't decrypt
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);

        await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisional.publicIdentity] });

        // Bob's provisional identity was added back, he can claim and decrypt
        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        await expectDecrypt([bobLaptop], clearText, encrypted);
      });

      it('should allow access to resources when adding back a member as a permanent identity', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisional.publicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisional.publicIdentity] });

        // Bob was removed, he can't decrypt anymore
        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);

        await aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [bobPublicIdentity] });

        // Bob was added back, he can decrypt
        await expectDecrypt([bobLaptop], clearText, encrypted);
      });

      it('should add a provisional member to a group twice then remove it', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisional.publicIdentity] })).to.be.fulfilled;
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisional.publicIdentity] })).to.be.fulfilled;
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisional.publicIdentity] })).to.be.fulfilled;

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('should add duplicate provisional users', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisional.publicIdentity, provisional.publicIdentity] })).to.be.fulfilled;

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        await expectDecrypt([bobLaptop], clearText, encrypted);
      });

      it('should remove duplicate provisional users', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisional.publicIdentity]);
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisional.publicIdentity, provisional.publicIdentity] })).to.be.fulfilled;

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when adding and removing the same provisional user', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisional.publicIdentity]);
        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToAdd: [provisional.publicIdentity], usersToRemove: [provisional.publicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'both added to and removed');
      });

      it('fails when creating a group with an already attached provisional identity with no share', async () => {
        await appHelper.attachVerifyProvisionalIdentity(aliceLaptop, provisional);

        await expect(bobLaptop.createGroup([provisional.publicIdentity])).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('fails when creating a group with an already attached provisional identity', async () => {
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] })).to.be.fulfilled;

        await appHelper.attachVerifyProvisionalIdentity(aliceLaptop, provisional);

        await expect(bobLaptop.createGroup([provisional.publicIdentity])).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('fails when removing a claimed provisional user with the provisional identity', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisional.publicIdentity]);

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);

        await expect(aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [provisional.publicIdentity] })).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('removes a member added by provisional identity after they have claimed it', async () => {
        const groupId = await aliceLaptop.createGroup([alicePublicIdentity, provisional.publicIdentity]);

        await appHelper.attachVerifyProvisionalIdentity(bobLaptop, provisional);

        await aliceLaptop.updateGroupMembers(groupId, { usersToRemove: [bobPublicIdentity] });
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithGroups: [groupId] });

        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
        await expect(bobLaptop.updateGroupMembers(groupId, { usersToAdd: [charliePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, 'You are not a member of this group');
      });
    });
  });
};
