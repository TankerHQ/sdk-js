import { errors } from '@tanker/core';
import { utils } from '@tanker/crypto';
import { getPublicIdentity, createIdentity, createProvisionalIdentity } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import type { AppHelper, TestArgs } from './helpers';
import { generateUserSession, generateProvisionalUserSession, UserSession, ProvisionalUserSession, encrypt, getPublicIdentities, attachProvisionalIdentities, checkGroup, checkDecrypt, checkDecryptFails } from './helpers';

export const generateGroupsTests = (args: TestArgs) => {
  describe('groups', () => {
    let appHelper: AppHelper;

    before(async () => {
      ({ appHelper } = args);
    });

    after(async () => {
      await UserSession.closeAllSessions();
    });

    type GroupConfig = {
      nbUsers: number,
      nbProvisionalUsersEmail: number,
      nbProvisionalUsersPhoneNumber: number,
    };

    const describeTest = (config: GroupConfig) => `${config.nbUsers} users, ${config.nbProvisionalUsersEmail} email provisional users, and ${config.nbProvisionalUsersPhoneNumber} phone number provisional users`;

    describe('createGroup', () => {
      describe('create group with any kind of members', () => {
        function runTest(config: GroupConfig) {
          it(describeTest(config), async () => {
            const owner = await UserSession.create(appHelper);

            const users = await generateUserSession(appHelper, config.nbUsers);
            const provisionalUsers = await generateProvisionalUserSession(appHelper, config.nbProvisionalUsersEmail, config.nbProvisionalUsersPhoneNumber);

            const publicIdentities = getPublicIdentities(...users, ...provisionalUsers);

            const myGroup = await owner.session.createGroup(publicIdentities);

            const encryptedBuffer = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await attachProvisionalIdentities(provisionalUsers);
            await checkGroup(myGroup,
              [encryptedBuffer],
              users.concat(provisionalUsers),
              []);
          });
        }

        const testCases = [
          { nbUsers: 1, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 2, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 2 },
          { nbUsers: 1, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 2, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 2 },
        ];

        testCases.map(runTest);
      });

      describe('create group with duplicate members', () => {
        function runTest(config: GroupConfig) {
          it(describeTest(config), async () => {
            const owner = await UserSession.create(appHelper);

            const users = await generateUserSession(appHelper, config.nbUsers);
            const provisionalUsers = await generateProvisionalUserSession(appHelper, config.nbProvisionalUsersEmail, config.nbProvisionalUsersPhoneNumber);

            const publicIdentities = getPublicIdentities(...users, ...provisionalUsers);

            if (users[0])
              publicIdentities.push(users[0].spublicIdentity);
            if (provisionalUsers[0])
              publicIdentities.push(provisionalUsers[0].spublicIdentity);

            const myGroup = await owner.session.createGroup(publicIdentities);

            const encryptedBuffer = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await attachProvisionalIdentities(provisionalUsers);
            await checkGroup(myGroup,
              [encryptedBuffer],
              users.concat(provisionalUsers),
              []);
          });
        }

        const testCases = [
          { nbUsers: 2, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 2 },
          { nbUsers: 1, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 2, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 2 },
        ];

        testCases.map(runTest);
      });

      it('create group with an empty list', async () => {
        const alice = await UserSession.create(appHelper);
        await expect(alice.session.createGroup([]))
          .to.be.rejectedWith(errors.InvalidArgument);
      });

      it('create group with invalid identities', async () => {
        const alice = await UserSession.create(appHelper);
        await expect(alice.session.createGroup(['AAAA=']))
          .to.be.rejectedWith(errors.InvalidArgument, 'AAAA=');
      });

      it('create group with an unknown user', async () => {
        const alice = await UserSession.create(appHelper);
        const user = await appHelper.makeUser();
        await expect(alice.session.createGroup([user.spublicIdentity]))
          .to.be.rejectedWith(errors.InvalidArgument);
      });

      it('create group with a user from another trustchain', async () => {
        const alice = await UserSession.create(appHelper);
        const otherTrustchain = {
          id: 'gOhJDFYKK/GNScGOoaZ1vLAwxkuqZCY36IwEo4jcnDE=',
          sk: 'D9jiQt7nB2IlRjilNwUVVTPsYkfbCX0PelMzx5AAXIaVokZ71iUduWCvJ9Akzojca6lvV8u1rnDVEdh7yO6JAQ==',
        };

        const wrongIdentity = await createIdentity(otherTrustchain.id, otherTrustchain.sk, 'someone');
        const wrongPublicIdentity = await getPublicIdentity(wrongIdentity);
        await expect(alice.session.createGroup([wrongPublicIdentity]))
          .to.be.rejectedWith(errors.InvalidArgument, 'Invalid appId for identities');
      });

      it('create group with an attached provisional identity', async () => {
        const alice = await UserSession.create(appHelper);
        const provisionalUser = await ProvisionalUserSession.create(appHelper);
        await provisionalUser.attach();
        await expect(alice.session.createGroup([provisionalUser.spublicIdentity]))
          .to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('create group with too many users', async () => {
        const alice = await UserSession.create(appHelper);
        const identities: Array<string> = [];
        for (let i = 0; i < 1001; ++i)
          identities.push(await getPublicIdentity(await createProvisionalIdentity(utils.toBase64(appHelper.appId), 'email', `bobtest${i}@tanker.io`)));
        await expect(alice.session.createGroup(identities))
          .to.be.rejectedWith(errors.GroupTooBig);
      });

      it('create group without self in group', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);

        const groupId = await alice.session.createGroup([bob.spublicIdentity]);

        const encryptedBuffer = await encrypt(bob.session, { shareWithGroups: [groupId] });

        await checkDecryptFails([alice], [encryptedBuffer]);

        // We can't assert this with decrypt because the server will not send the
        // key publish. This is the only way I have found to assert that.
        // eslint-disable-next-line no-underscore-dangle
        await expect(alice.session._session!._storage.groupStore._findGroupsByGroupId([groupId])).to.eventually.deep.equal([]);
      });
    });

    describe('updateGroup(usersToAdd)', () => {
      describe('add any kind of members to group', () => {
        const runTest = (config: GroupConfig) => {
          it(describeTest(config), async () => {
            const owner = await UserSession.create(appHelper);

            const users = await generateUserSession(appHelper, config.nbUsers);
            const provisionalUsers = await generateProvisionalUserSession(appHelper, config.nbProvisionalUsersEmail, config.nbProvisionalUsersPhoneNumber);

            const publicIdentities = getPublicIdentities(...users, ...provisionalUsers);
            const myGroup = await owner.session.createGroup([owner.spublicIdentity]);

            const encryptedBuffer = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await owner.session.updateGroupMembers(myGroup, { usersToAdd: publicIdentities });

            const encryptedBuffer2 = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await attachProvisionalIdentities(provisionalUsers);
            await checkGroup(myGroup,
              [encryptedBuffer, encryptedBuffer2],
              users.concat(provisionalUsers),
              []);
          });
        };

        const testCases = [
          { nbUsers: 1, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 2, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 2 },
          { nbUsers: 1, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 2, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 2 },
        ];

        testCases.map(runTest);
      });

      describe('add duplicate members to group', () => {
        const runTest = (config: GroupConfig) => {
          it(describeTest(config), async () => {
            const owner = await UserSession.create(appHelper);

            const users = await generateUserSession(appHelper, config.nbUsers);
            const provisionalUsers = await generateProvisionalUserSession(appHelper, config.nbProvisionalUsersEmail, config.nbProvisionalUsersPhoneNumber);

            const publicIdentities = getPublicIdentities(...users, ...provisionalUsers);
            const myGroup = await owner.session.createGroup([owner.spublicIdentity]);

            if (users[0])
              publicIdentities.push(users[0].spublicIdentity);
            if (provisionalUsers[0])
              publicIdentities.push(provisionalUsers[0].spublicIdentity);

            const encryptedBuffer = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await owner.session.updateGroupMembers(myGroup, { usersToAdd: publicIdentities });

            const encryptedBuffer2 = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await attachProvisionalIdentities(provisionalUsers);
            await checkGroup(myGroup,
              [encryptedBuffer, encryptedBuffer2],
              users.concat(provisionalUsers),
              []);
          });
        };

        const testCases = [
          { nbUsers: 2, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 2 },
          { nbUsers: 1, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 2, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 2 },
        ];

        testCases.map(runTest);
      });

      describe('add any kind of members multiple times to group', () => {
        const runTest = (config: GroupConfig) => {
          it(describeTest(config), async () => {
            const owner = await UserSession.create(appHelper);

            const users = await generateUserSession(appHelper, config.nbUsers);
            const provisionalUsers = await generateProvisionalUserSession(appHelper, config.nbProvisionalUsersEmail, config.nbProvisionalUsersPhoneNumber);

            const publicIdentities = getPublicIdentities(...users, ...provisionalUsers);
            const myGroup = await owner.session.createGroup([owner.spublicIdentity]);

            const encryptedBuffer = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await owner.session.updateGroupMembers(myGroup, { usersToAdd: publicIdentities });
            await owner.session.updateGroupMembers(myGroup, { usersToAdd: publicIdentities });

            const encryptedBuffer2 = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await attachProvisionalIdentities(provisionalUsers);
            await checkGroup(myGroup,
              [encryptedBuffer, encryptedBuffer2],
              users.concat(provisionalUsers),
              []);
          });
        };

        const testCases = [
          { nbUsers: 2, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 2 },
          { nbUsers: 1, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 2, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 2 },
        ];

        testCases.map(runTest);
      });

      it('add too many members at once', async () => {
        const alice = await UserSession.create(appHelper);

        const groupId = await alice.session.createGroup([alice.spublicIdentity]);

        const identities: Array<string> = [];
        for (let i = 0; i < 1001; ++i)
          identities.push(
            await getPublicIdentity(await createProvisionalIdentity(
              utils.toBase64(appHelper.appId), 'email', `bobtest${i}@tanker.io`,
            )),
          );
        expect(alice.session.updateGroupMembers(groupId, { usersToAdd: identities }))
          .to.be.rejectedWith(errors.GroupTooBig);
      });

      it('transitively add users to a group', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const charlie = await UserSession.create(appHelper);

        const groupId = await alice.session.createGroup([bob.spublicIdentity]);
        await bob.session.updateGroupMembers(groupId, { usersToAdd: [charlie.spublicIdentity] });
        await charlie.session.updateGroupMembers(groupId, { usersToAdd: [alice.spublicIdentity] });

        const encryptedBuffer = await encrypt(charlie.session, { shareWithGroups: [groupId] });

        await checkGroup(groupId, [encryptedBuffer], [alice, bob, charlie], []);
      });
    });

    describe('updateGroup(usersToRemove)', () => {
      const makeRemoveTestViews = (
        users: Array<UserSession>,
        provisionalUsers: Array<ProvisionalUserSession>,
        nbUsers: number,
        nbProvisionalUsersEmail: number,
      ): [Array<UserSession>, Array<UserSession>, Array<UserSession>, Array<UserSession>] => {
        const usersToRemove = users.slice(0, nbUsers);
        const usersToKeep = users.slice(nbUsers);
        const provisionalUsersToRemove = provisionalUsers.slice(0, nbProvisionalUsersEmail);
        const provisionalUsersToKeep = provisionalUsers.slice(nbProvisionalUsersEmail);
        return [usersToRemove,
          usersToKeep,
          provisionalUsersToRemove,
          provisionalUsersToKeep];
      };

      describe('remove any kind of members from group', () => {
        const runTest = (config: GroupConfig) => {
          it(describeTest(config), async () => {
            const owner = await UserSession.create(appHelper);

            const users = await generateUserSession(appHelper, 2);
            const provisionalUsers = await generateProvisionalUserSession(appHelper, 2, 2);

            const [usersToRemove, usersToKeep, provisionalUsersToRemove, provisionalUsersToKeep] = makeRemoveTestViews(users, provisionalUsers, config.nbUsers, config.nbProvisionalUsersEmail + config.nbProvisionalUsersPhoneNumber);

            const publicIdentities = getPublicIdentities(...users, ...provisionalUsers, owner);

            const publicIdentitiesToRemove = getPublicIdentities(...usersToRemove, ...provisionalUsersToRemove);

            const myGroup = await owner.session.createGroup(publicIdentities);

            const encryptedBuffer = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await owner.session.updateGroupMembers(
              myGroup, { usersToRemove: publicIdentitiesToRemove },
            );

            const encryptedBuffer2 = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await attachProvisionalIdentities(provisionalUsers);
            await checkGroup(
              myGroup,
              [encryptedBuffer, encryptedBuffer2],
              usersToKeep.concat(provisionalUsersToKeep),
              usersToRemove.concat(provisionalUsersToRemove),
            );
          });
        };

        const testCases = [
          { nbUsers: 1, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 2, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 2 },
          { nbUsers: 1, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 2, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 2 },
        ];

        testCases.map(runTest);
      });

      describe('remove duplicate members from group', () => {
        const runTest = (config: GroupConfig) => {
          it(describeTest(config), async () => {
            const owner = await UserSession.create(appHelper);

            const users = await generateUserSession(appHelper, 2);
            const provisionalUsers = await generateProvisionalUserSession(appHelper, 2, 2);

            const [usersToRemove, usersToKeep, provisionalUsersToRemove, provisionalUsersToKeep] = makeRemoveTestViews(users, provisionalUsers, config.nbUsers, config.nbProvisionalUsersEmail + config.nbProvisionalUsersPhoneNumber);

            const publicIdentities = getPublicIdentities(...users, ...provisionalUsers, owner);

            const publicIdentitiesToRemove = getPublicIdentities(...usersToRemove, ...provisionalUsersToRemove);

            if (usersToRemove[0])
              publicIdentitiesToRemove.push(usersToRemove[0].spublicIdentity);
            if (provisionalUsersToRemove[0])
              publicIdentitiesToRemove.push(provisionalUsersToRemove[0].spublicIdentity);

            const myGroup = await owner.session.createGroup(publicIdentities);

            const encryptedBuffer = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await owner.session.updateGroupMembers(
              myGroup, { usersToRemove: publicIdentitiesToRemove },
            );

            const encryptedBuffer2 = await encrypt(owner.session, { shareWithGroups: [myGroup] });

            await attachProvisionalIdentities(provisionalUsers);
            await checkGroup(
              myGroup,
              [encryptedBuffer, encryptedBuffer2],
              usersToKeep.concat(provisionalUsersToKeep),
              usersToRemove.concat(provisionalUsersToRemove),
            );
          });
        };

        const testCases = [
          { nbUsers: 2, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 0 },
          { nbUsers: 0, nbProvisionalUsersEmail: 0, nbProvisionalUsersPhoneNumber: 2 },
          { nbUsers: 1, nbProvisionalUsersEmail: 1, nbProvisionalUsersPhoneNumber: 1 },
          { nbUsers: 2, nbProvisionalUsersEmail: 2, nbProvisionalUsersPhoneNumber: 2 },
        ];

        testCases.map(runTest);
      });

      it('update group members with empty lists', async () => {
        const alice = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([alice.spublicIdentity]);
        await expect(alice.session.updateGroupMembers(groupId, { usersToAdd: [], usersToRemove: [] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'no members to add or remove');
      });

      it('update group members with invalid identities', async () => {
        const alice = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([alice.spublicIdentity]);
        await expect(alice.session.updateGroupMembers(groupId, { usersToAdd: ['AAAA='] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'AAAA=');
        await expect(alice.session.updateGroupMembers(groupId, { usersToRemove: ['AAAA='] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'AAAA=');
      });

      it('update group members with an unknown user', async () => {
        const alice = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([alice.spublicIdentity]);
        const user = await appHelper.makeUser();
        await expect(alice.session.updateGroupMembers(groupId, { usersToAdd: [user.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument);
        // Here we test a removal of a non-registered user, however the detected error
        // is not that the user is unknown but that the user is not a member of the
        // group.
        await expect(alice.session.updateGroupMembers(groupId, { usersToRemove: [user.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument);
      });

      it('update group members with a user from another trustchain', async () => {
        const alice = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([alice.spublicIdentity]);
        const otherTrustchain = {
          id: 'gOhJDFYKK/GNScGOoaZ1vLAwxkuqZCY36IwEo4jcnDE=',
          sk: 'D9jiQt7nB2IlRjilNwUVVTPsYkfbCX0PelMzx5AAXIaVokZ71iUduWCvJ9Akzojca6lvV8u1rnDVEdh7yO6JAQ==',
        };
        const wrongIdentity = await createIdentity(otherTrustchain.id, otherTrustchain.sk, 'someone');
        const wrongPublicIdentity = await getPublicIdentity(wrongIdentity);
        await expect(alice.session.updateGroupMembers(groupId, { usersToAdd: [wrongPublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'Invalid appId for identities');
      });

      it('update group members adding and removing the same user', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([alice.spublicIdentity]);
        await expect(alice.session.updateGroupMembers(groupId, { usersToAdd: [bob.spublicIdentity], usersToRemove: [bob.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'both added to and removed');
        const provisionalUser2 = await ProvisionalUserSession.create(appHelper);
        await expect(alice.session.updateGroupMembers(groupId, { usersToAdd: [provisionalUser2.spublicIdentity], usersToRemove: [provisionalUser2.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'both added to and removed');
      });

      it('update group members with invalid group id', async () => {
        const alice = await UserSession.create(appHelper);
        await expect(alice.session.updateGroupMembers('', { usersToAdd: [alice.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument);
        const badGroupID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        await expect(alice.session.updateGroupMembers(badGroupID, { usersToAdd: [alice.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, badGroupID);
      });

      it('update group members with an attached provisional identity', async () => {
        const alice = await UserSession.create(appHelper);
        const provisionalUser = await ProvisionalUserSession.create(appHelper);
        const groupId = await alice.session.createGroup(
          [alice.spublicIdentity, provisionalUser.spublicIdentity],
        );
        await provisionalUser.attach();

        await expect(alice.session.updateGroupMembers(
          groupId, { usersToAdd: [provisionalUser.spublicIdentity] },
        ))
          .to.be.rejectedWith(errors.IdentityAlreadyAttached);
        await expect(alice.session.updateGroupMembers(
          groupId, { usersToRemove: [provisionalUser.spublicIdentity] },
        ))
          .to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('remove a user who is not a member', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([alice.spublicIdentity]);

        await expect(alice.session.updateGroupMembers(groupId, { usersToRemove: [bob.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'Some users are not part of this group');
      });

      it('remove all group members', async () => {
        const alice = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([alice.spublicIdentity]);
        await expect(alice.session.updateGroupMembers(groupId, { usersToRemove: [alice.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'removing all members');
      });

      it('update a group we are not part of', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const charlie = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([alice.spublicIdentity, charlie.spublicIdentity]);
        await expect(bob.session.updateGroupMembers(groupId, { usersToAdd: [bob.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'not a group member');
        await expect(bob.session.updateGroupMembers(groupId, { usersToRemove: [charlie.spublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'not a group member');
      });

      it('remove oneself from group', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);

        const groupId = await alice.session.createGroup([alice.spublicIdentity, bob.spublicIdentity]);
        await alice.session.updateGroupMembers(groupId, { usersToRemove: [alice.spublicIdentity] });

        const encryptedBuffer = await encrypt(bob.session, { shareWithGroups: [groupId] });

        await checkGroup(groupId,
          [encryptedBuffer],
          [],
          [alice]);
      });

      it('update group with added and removed members', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const charlie = await UserSession.create(appHelper);

        const groupId = await alice.session.createGroup([alice.spublicIdentity, charlie.spublicIdentity]);

        const encryptedBuffer = await encrypt(alice.session, { shareWithGroups: [groupId] });

        await alice.session.updateGroupMembers(groupId,
          { usersToAdd: [bob.spublicIdentity], usersToRemove: [charlie.spublicIdentity] });

        await checkGroup(
          groupId,
          [encryptedBuffer],
          [bob],
          [charlie],
        );
      });

      it('remove claimed provisional group members as a permanent identity', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await ProvisionalUserSession.create(appHelper);

        const myGroup = await alice.session.createGroup(
          [alice.spublicIdentity, bob.spublicIdentity],
        );

        await bob.attach();

        await alice.session.updateGroupMembers(myGroup, { usersToRemove: [bob.userSPublicIdentity] });

        const encryptedBuffer = await encrypt(alice.session, { shareWithGroups: [myGroup] });

        await checkGroup(
          myGroup,
          [encryptedBuffer],
          [alice],
          [bob],
        );
      });
    });

    describe('encrypt/share', () => {
      it('dedupes groupIds when encrypting/sharing with the same group twice', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([bob.spublicIdentity]);
        const encrypted = await encrypt(alice.session, { shareWithGroups: [groupId, groupId] });

        await checkDecrypt([bob], [encrypted]);
      });

      it('encrypt for two groups', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const charlie = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([bob.spublicIdentity]);
        const groupId2 = await alice.session.createGroup([charlie.spublicIdentity]);
        const encrypted = await encrypt(alice.session, { shareWithGroups: [groupId, groupId2] });

        await checkDecrypt([bob, charlie], [encrypted]);
      });

      it('share with one group', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([bob.spublicIdentity]);
        const encrypted = await encrypt(alice.session, {});
        const resourceId = await alice.session.getResourceId(encrypted.encryptedData);
        await alice.session.share([resourceId], { shareWithGroups: [groupId] });

        await checkDecrypt([bob], [encrypted]);
      });

      it('share with two groups', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);
        const charlie = await UserSession.create(appHelper);
        const groupId = await alice.session.createGroup([bob.spublicIdentity]);
        const groupId2 = await alice.session.createGroup([charlie.spublicIdentity]);
        const encrypted = await encrypt(alice.session, {});
        const resourceId = await alice.session.getResourceId(encrypted.encryptedData);
        await alice.session.share([resourceId], { shareWithGroups: [groupId, groupId2] });

        await checkDecrypt([bob, charlie], [encrypted]);
      });
    });

    describe('edge cases', () => {
      it('create group, verify group, attach provisional identity and decrypt', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await ProvisionalUserSession.create(appHelper);

        const myGroup = await alice.session.createGroup([bob.spublicIdentity]);

        const encryptedBuffer = await encrypt(alice.session, { shareWithGroups: [myGroup] });

        // Fetch the group and add it into the GroupStore as ExternalGroup
        await encrypt(bob.session, { shareWithGroups: [myGroup] });

        await bob.attach();

        // Upgrade it to InternalGroup
        await checkDecrypt([bob], [encryptedBuffer]);
      });

      it('add to group, verify group, attach provisional identity and decrypt', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await ProvisionalUserSession.create(appHelper);

        const myGroup = await alice.session.createGroup([alice.spublicIdentity]);

        const encryptedBuffer = await encrypt(alice.session, { shareWithGroups: [myGroup] });

        await alice.session.updateGroupMembers(myGroup, { usersToAdd: [bob.spublicIdentity] });

        // Fetch the group and add it into the GroupStore as ExternalGroup
        await encrypt(bob.session, { shareWithGroups: [myGroup] });

        await bob.attach();

        // Upgrade it to InternalGroup
        await checkDecrypt([bob], [encryptedBuffer]);
      });

      it('decrypt when a key is shared through two groups', async () => {
        const alice = await UserSession.create(appHelper);
        const bob = await UserSession.create(appHelper);

        const myGroup = await alice.session.createGroup([bob.spublicIdentity]);
        const myGroup2 = await alice.session.createGroup([bob.spublicIdentity]);

        const encryptedBuffer = await encrypt(alice.session, { shareWithGroups: [myGroup, myGroup2] });

        await checkDecrypt([bob], [encryptedBuffer]);
      });
    });
  });
};
