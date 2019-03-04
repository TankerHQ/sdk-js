// @flow
import { ready as cryptoReady, tcrypto, random, utils } from '@tanker/crypto';
import { GroupTooBig, InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { MAX_GROUP_MEMBERS_PER_OPERATION, assertPublicIdentities, groupFromUserGroupEntry, groupsFromEntries } from '../ManagerHelper';
import type { UserGroupCreationRecord, UserGroupUpdateRecord, UserGroupEntry } from '../Serialize';

import { type ExternalGroup } from '../types';

import TestGenerator, { type TestDeviceCreation, type TestUserGroup } from '../../__tests__/TestGenerator';
import ProvisionalIdentityManager from '../../ProvisionalIdentity/Manager';
import LocalUser from '../../LocalUser/LocalUser';

function getExternalGroupFromUserGroupCreation(userGroupEntry: UserGroupEntry): ExternalGroup {
  const userGroupCreation: UserGroupCreationRecord = (userGroupEntry: any);

  return {
    groupId: userGroupCreation.public_signature_key,
    lastPublicSignatureKey: userGroupCreation.public_signature_key,
    lastPublicEncryptionKey: userGroupCreation.public_encryption_key,
    lastGroupBlock: userGroupEntry.hash,
    lastKeyRotationBlock: userGroupEntry.hash,
    encryptedPrivateSignatureKey: userGroupCreation.encrypted_group_private_signature_key,
  };
}

function getExternalGroupFromUserGroupAddition(userGroupEntry: UserGroupEntry, previousGroup: ExternalGroup): ExternalGroup {
  const externalGroup: ExternalGroup = {
    ...previousGroup,
    lastGroupBlock: userGroupEntry.hash,
  };
  return externalGroup;
}

function getExternalGroupFromUserGroupUpdate(userGroupEntry: UserGroupEntry, previousGroup: ExternalGroup): ExternalGroup {
  const userGroupUpdate: UserGroupUpdateRecord = (userGroupEntry: any);
  return {
    groupId: previousGroup.groupId,
    lastPublicSignatureKey: userGroupUpdate.public_signature_key,
    lastPublicEncryptionKey: userGroupUpdate.public_encryption_key,
    lastGroupBlock: userGroupEntry.hash,
    lastKeyRotationBlock: userGroupEntry.hash,
    encryptedPrivateSignatureKey: userGroupUpdate.encrypted_group_private_signature_key,
  };
}

describe('GroupManagerHelper', () => {
  let testGenerator: TestGenerator;
  let userCreation: TestDeviceCreation;
  let provisionalIdentityManager;
  let localUser;
  let userGroupCreation: TestUserGroup;

  before(() => cryptoReady);

  beforeEach(async () => {
    testGenerator = new TestGenerator();
    testGenerator.makeTrustchainCreation();
    const userId = random(tcrypto.HASH_SIZE);
    userCreation = await testGenerator.makeUserCreation(userId);

    localUser = (({ findUserKey: () => userCreation.testUser.userKeys[0] }: any): LocalUser);
    userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
    provisionalIdentityManager = (({
      findPrivateProvisionalKeys: () => null,
      refreshProvisionalPrivateKeys: () => null,
    }: any): ProvisionalIdentityManager);
  });

  describe('assertPublicIdentities()', () => {
    it('throws when creating a group with 0 members', () => {
      expect(() => assertPublicIdentities([])).to.throw(InvalidArgument);
    });

    it('throws when creating a group with 1001 members', () => {
      const users = Array.from({ length: MAX_GROUP_MEMBERS_PER_OPERATION + 1 }, () => 'bob');
      expect(() => assertPublicIdentities(users)).to.throw(GroupTooBig);
    });
  });

  const describeGroupAdditionTests = (version: number) => {
    let makeUserGroupAddition;
    beforeEach(() => {
      makeUserGroupAddition = {
        '2': testGenerator.makeUserGroupAdditionV2, // eslint-disable-line quote-props
        '3': testGenerator.makeUserGroupAdditionV3, // eslint-disable-line quote-props
      }[version];

      if (!makeUserGroupAddition) {
        throw Error('Assertion error: unknown version in test generation');
      }
    });
    describe(`user group addition v${version}`, () => {
      describe('groupFromUserGroupEntry()', () => {
        describe('with internal groups', () => {
          it('can create a group with a userGroupCreation action', () => {
            const group = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);
            const expectedGroup = {
              groupId: userGroupCreation.groupData.groupId,
              lastPublicSignatureKey: userGroupCreation.groupData.signatureKeyPair.publicKey,
              lastPublicEncryptionKey: userGroupCreation.groupData.encryptionKeyPair.publicKey,
              lastGroupBlock: userGroupCreation.groupData.lastGroupBlock,
              lastKeyRotationBlock: userGroupCreation.userGroupEntry.hash,
              signatureKeyPairs: [userGroupCreation.groupData.signatureKeyPair],
              encryptionKeyPairs: [userGroupCreation.groupData.encryptionKeyPair],
            };
            expect(group).to.deep.equal(expectedGroup);
          });

          it('can create a group with a userGroupCreation action from a provisional user', () => {
            const provisionalResult = testGenerator.makeProvisionalUser();
            // $FlowIgnore[cannot-write]
            provisionalIdentityManager.findPrivateProvisionalKeys = () => provisionalResult.provisionalUserKeys;

            userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [], [provisionalResult.publicProvisionalUser]);
            const group = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);

            const expectedGroup = {
              groupId: userGroupCreation.groupData.groupId,
              lastPublicSignatureKey: userGroupCreation.groupData.signatureKeyPair.publicKey,
              lastPublicEncryptionKey: userGroupCreation.groupData.encryptionKeyPair.publicKey,
              lastGroupBlock: userGroupCreation.groupData.lastGroupBlock,
              lastKeyRotationBlock: userGroupCreation.userGroupEntry.hash,
              signatureKeyPairs: [userGroupCreation.groupData.signatureKeyPair],
              encryptionKeyPairs: [userGroupCreation.groupData.encryptionKeyPair],
            };
            expect(group).to.deep.equal(expectedGroup);
          });

          it('can update a group with a userGroupAddition', async () => {
            let group = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation, [userCreation2.user]);

            group = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);

            const expectedGroup = {
              groupId: userGroupCreation.groupData.groupId,
              lastPublicSignatureKey: userGroupCreation.groupData.signatureKeyPair.publicKey,
              lastPublicEncryptionKey: userGroupCreation.groupData.encryptionKeyPair.publicKey,
              lastGroupBlock: userGroupAddition.groupData.lastGroupBlock,
              lastKeyRotationBlock: userGroupCreation.userGroupEntry.hash,
              signatureKeyPairs: [userGroupCreation.groupData.signatureKeyPair],
              encryptionKeyPairs: [userGroupCreation.groupData.encryptionKeyPair],
            };
            expect(group).to.deep.equal(expectedGroup);
          });

          it('can update a group with a userGroupAddition from a provisional user', () => {
            let group = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);
            const provisionalResult = testGenerator.makeProvisionalUser();
            // $FlowIgnore[cannot-write]
            provisionalIdentityManager.findPrivateProvisionalKeys = () => provisionalResult.provisionalUserKeys;

            const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation, [], [provisionalResult.publicProvisionalUser]);

            group = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);

            const expectedGroup = {
              groupId: userGroupCreation.groupData.groupId,
              lastPublicSignatureKey: userGroupCreation.groupData.signatureKeyPair.publicKey,
              lastPublicEncryptionKey: userGroupCreation.groupData.encryptionKeyPair.publicKey,
              lastGroupBlock: userGroupAddition.groupData.lastGroupBlock,
              lastKeyRotationBlock: userGroupCreation.userGroupEntry.hash,
              signatureKeyPairs: [userGroupCreation.groupData.signatureKeyPair],
              encryptionKeyPairs: [userGroupCreation.groupData.encryptionKeyPair],
            };
            expect(group).to.deep.equal(expectedGroup);
          });

          it('can create a group with a group private signature key in the group addition', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation, [userCreation2.user]);

            localUser = (({ findUserKey: () => null }: any): LocalUser);
            let group = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);

            localUser = (({ findUserKey: () => userCreation2.testUser.userKeys[0] }: any): LocalUser);
            group = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);

            const expectedGroup = {
              groupId: userGroupCreation.groupData.groupId,
              lastPublicSignatureKey: userGroupCreation.groupData.signatureKeyPair.publicKey,
              lastPublicEncryptionKey: userGroupCreation.groupData.encryptionKeyPair.publicKey,
              lastGroupBlock: userGroupAddition.groupData.lastGroupBlock,
              lastKeyRotationBlock: userGroupCreation.userGroupEntry.hash,
              signatureKeyPairs: [userGroupCreation.groupData.signatureKeyPair],
              encryptionKeyPairs: [userGroupCreation.groupData.encryptionKeyPair],
            };
            expect(group).to.deep.equal(expectedGroup);
          });

          it('can update a group with a userGroupUpdate after a userGroupCreation', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));

            const provisionalResult = testGenerator.makeProvisionalUser();
            const provisionalResult2 = testGenerator.makeProvisionalUser();
            // UserGroupCreation with user1 user2 and provisionalUser1
            const userGroupCreation2 = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user, userCreation2.user], [provisionalResult.publicProvisionalUser]);
            const groupCreation = groupFromUserGroupEntry(userGroupCreation2.userGroupEntry, null, localUser, provisionalIdentityManager);
            // UserGroupUpdate with user1 and provisionalUser2
            const userGroupUpdate = testGenerator.makeUserGroupUpdate(userCreation, userGroupCreation2, [], [provisionalResult2.publicProvisionalUser], [userCreation2.testUser.publicPermanentIdentity], [provisionalResult.publicProvisionalIdentity]);

            const groupUpdate = groupFromUserGroupEntry(userGroupUpdate.userGroupEntry, groupCreation, localUser, provisionalIdentityManager);

            const expectedGroup = {
              groupId: userGroupCreation2.groupData.groupId,
              lastPublicSignatureKey: userGroupUpdate.groupData.signatureKeyPair.publicKey,
              lastPublicEncryptionKey: userGroupUpdate.groupData.encryptionKeyPair.publicKey,
              lastGroupBlock: userGroupUpdate.groupData.lastGroupBlock,
              lastKeyRotationBlock: userGroupUpdate.userGroupEntry.hash,
              signatureKeyPairs: [userGroupUpdate.groupData.signatureKeyPair],
              encryptionKeyPairs: [userGroupUpdate.groupData.encryptionKeyPair],
            };
            expect(groupUpdate).to.deep.equal(expectedGroup);
          });

          it('can update a group with a userGroupUpdate after a userGroupAddition', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userCreation3 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));

            const provisionalResult = testGenerator.makeProvisionalUser();
            const provisionalResult2 = testGenerator.makeProvisionalUser();
            // UserGroupCreation with user1 user2 and provisionalUser1
            const userGroupCreation2 = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user, userCreation2.user], [provisionalResult.publicProvisionalUser]);
            const groupCreation = groupFromUserGroupEntry(userGroupCreation2.userGroupEntry, null, localUser, provisionalIdentityManager);

            // UserGroupAddition with user3
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation2, [userCreation3.user]);
            const groupAddition = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, groupCreation, localUser, provisionalIdentityManager);

            // UserGroupUpdate with user1 and provisionalUser2
            const userGroupUpdate = testGenerator.makeUserGroupUpdate(userCreation, userGroupAddition, [], [provisionalResult2.publicProvisionalUser], [userCreation2.testUser.publicPermanentIdentity], [provisionalResult.publicProvisionalIdentity]);
            const groupUpdate = groupFromUserGroupEntry(userGroupUpdate.userGroupEntry, groupAddition, localUser, provisionalIdentityManager);

            const expectedGroup = {
              groupId: userGroupCreation2.groupData.groupId,
              lastPublicSignatureKey: userGroupUpdate.groupData.signatureKeyPair.publicKey,
              lastPublicEncryptionKey: userGroupUpdate.groupData.encryptionKeyPair.publicKey,
              lastGroupBlock: userGroupUpdate.groupData.lastGroupBlock,
              lastKeyRotationBlock: userGroupUpdate.userGroupEntry.hash,
              signatureKeyPairs: [userGroupUpdate.groupData.signatureKeyPair],
              encryptionKeyPairs: [userGroupUpdate.groupData.encryptionKeyPair],
            };
            expect(groupUpdate).to.deep.equal(expectedGroup);
          });

          it('can update a group with a userGroupUpdate after a userGroupUpdate', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userCreation3 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));

            const provisionalResult = testGenerator.makeProvisionalUser();
            const provisionalResult2 = testGenerator.makeProvisionalUser();
            // UserGroupCreation with user1 user2 and provisionalUser1
            const userGroupCreation2 = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user, userCreation2.user], [provisionalResult.publicProvisionalUser]);
            const groupCreation = groupFromUserGroupEntry(userGroupCreation2.userGroupEntry, null, localUser, provisionalIdentityManager);

            // UserGroupUpdate with user1, user3 and provisionalUser1
            const userGroupUpdate1 = testGenerator.makeUserGroupUpdate(userCreation, userGroupCreation2, [userCreation3.user], [], [userCreation2.testUser.publicPermanentIdentity]);
            const groupUpdate1 = groupFromUserGroupEntry(userGroupUpdate1.userGroupEntry, groupCreation, localUser, provisionalIdentityManager);

            // UserGroupUpdate with user1 and provisionalUser2
            const userGroupUpdate2 = testGenerator.makeUserGroupUpdate(userCreation, userGroupUpdate1, [], [provisionalResult2.publicProvisionalUser], [userCreation2.testUser.publicPermanentIdentity], [provisionalResult.publicProvisionalIdentity]);
            const groupUpdate2 = groupFromUserGroupEntry(userGroupUpdate2.userGroupEntry, groupUpdate1, localUser, provisionalIdentityManager);

            const expectedGroup = {
              groupId: userGroupCreation2.groupData.groupId,
              lastPublicSignatureKey: userGroupUpdate2.groupData.signatureKeyPair.publicKey,
              lastPublicEncryptionKey: userGroupUpdate2.groupData.encryptionKeyPair.publicKey,
              lastGroupBlock: userGroupUpdate2.groupData.lastGroupBlock,
              lastKeyRotationBlock: userGroupUpdate2.userGroupEntry.hash,
              signatureKeyPairs: [userGroupUpdate2.groupData.signatureKeyPair],
              encryptionKeyPairs: [userGroupUpdate2.groupData.encryptionKeyPair],
            };
            expect(groupUpdate2).to.deep.equal(expectedGroup);
          });
        });

        describe('with external groups', () => {
          beforeEach(() => {
            localUser = (({ findUserKey: () => null }: any): LocalUser);
          });

          it('can create an external group from a userGroupCreation action', () => {
            const externalGroup = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);
            expect(externalGroup).to.deep.equal(getExternalGroupFromUserGroupCreation(userGroupCreation.userGroupEntry));
          });

          it('can update an external group from a userGroupCreation action', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation, [userCreation2.user]);

            let resultGroup = getExternalGroupFromUserGroupCreation(userGroupCreation.userGroupEntry);
            resultGroup = getExternalGroupFromUserGroupAddition(userGroupAddition.userGroupEntry, resultGroup);

            let externalGroup = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);
            externalGroup = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, externalGroup, localUser, provisionalIdentityManager);
            expect(externalGroup).to.deep.equal(resultGroup);
          });

          it('can create an external group from a userGroupCreation action with a provisional user', () => {
            const provisionalResult = testGenerator.makeProvisionalUser();

            userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [], [provisionalResult.publicProvisionalUser]);
            const externalGroup = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);
            expect(externalGroup).to.deep.equal(getExternalGroupFromUserGroupCreation(userGroupCreation.userGroupEntry));
          });

          it('can update an external group from a userGroupCreation action with a provisional user', () => {
            const provisionalResult = testGenerator.makeProvisionalUser();
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation, [], [provisionalResult.publicProvisionalUser]);

            let resultGroup = getExternalGroupFromUserGroupCreation(userGroupCreation.userGroupEntry);
            resultGroup = getExternalGroupFromUserGroupAddition(userGroupAddition.userGroupEntry, resultGroup);

            let externalGroup = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);
            externalGroup = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, externalGroup, localUser, provisionalIdentityManager);
            expect(externalGroup).to.deep.equal(resultGroup);
          });

          it('can update an external group from a userGroupCreation action with userGroupUpdate', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));

            const provisionalResult = testGenerator.makeProvisionalUser();
            const provisionalResult2 = testGenerator.makeProvisionalUser();
            // UserGroupCreation with user1 user2 and provisionalUser1
            const userGroupCreation2 = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user, userCreation2.user], [provisionalResult.publicProvisionalUser]);
            const groupCreation = getExternalGroupFromUserGroupCreation(userGroupCreation2.userGroupEntry);

            // UserGroupUpdate with user1 and provisionalUser2
            const userGroupUpdate = testGenerator.makeUserGroupUpdate(userCreation, userGroupCreation2, [], [provisionalResult2.publicProvisionalUser], [userCreation2.testUser.publicPermanentIdentity], [provisionalResult.publicProvisionalIdentity]);
            const groupUpdate = groupFromUserGroupEntry(userGroupUpdate.userGroupEntry, groupCreation, localUser, provisionalIdentityManager);

            const externalGroupUpdate = getExternalGroupFromUserGroupUpdate(userGroupUpdate.userGroupEntry, groupCreation);

            expect(externalGroupUpdate).to.deep.equal(groupUpdate);
          });
        });
      });

      describe('inflateFromBlocks()', () => {
        describe('with userGroupAddition', () => {
          it('can inflate multiple blocks from different groups', async () => {
            const groupCreation = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);

            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation, [userCreation2.user]);
            const groupAddition = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, groupCreation, localUser, provisionalIdentityManager);

            const userCreation3 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupCreation3 = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
            const groupCreation3 = groupFromUserGroupEntry(userGroupCreation3.userGroupEntry, null, localUser, provisionalIdentityManager);

            const userGroupAddition2 = makeUserGroupAddition(userCreation, userGroupCreation3, [userCreation2.user]);
            const groupAddition2 = groupFromUserGroupEntry(userGroupAddition2.userGroupEntry, groupCreation3, localUser, provisionalIdentityManager);

            const userGroupAddition3 = makeUserGroupAddition(userCreation, userGroupAddition2, [userCreation3.user]);
            const groupAddition3 = groupFromUserGroupEntry(userGroupAddition3.userGroupEntry, groupAddition2, localUser, provisionalIdentityManager);

            const entries = [userGroupCreation.userGroupEntry, userGroupCreation3.userGroupEntry, userGroupAddition2.userGroupEntry, userGroupAddition.userGroupEntry, userGroupAddition3.userGroupEntry];

            const devicesPublicSignatureKeys: Map<string, Uint8Array> = new Map();
            devicesPublicSignatureKeys.set(utils.toBase64(userCreation.testDevice.id), userCreation.testDevice.signKeys.publicKey);
            devicesPublicSignatureKeys.set(utils.toBase64(userCreation2.testDevice.id), userCreation2.testDevice.signKeys.publicKey);
            devicesPublicSignatureKeys.set(utils.toBase64(userCreation3.testDevice.id), userCreation3.testDevice.signKeys.publicKey);

            const resultGroups = await groupsFromEntries(entries, devicesPublicSignatureKeys, localUser, provisionalIdentityManager);

            expect(resultGroups.length).to.deep.equal(2);
            expect(resultGroups[0]).to.deep.equal(groupAddition);
            expect(resultGroups[1]).to.deep.equal(groupAddition3);
          });
        });
      });
    });
  };
  describeGroupAdditionTests(2);
  describeGroupAdditionTests(3);
});
