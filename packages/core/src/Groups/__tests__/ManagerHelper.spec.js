// @flow
import { ready as cryptoReady, tcrypto, random, utils } from '@tanker/crypto';
import { GroupTooBig } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { MAX_GROUP_MEMBERS_PER_OPERATION, assertPublicIdentities, groupFromUserGroupEntry, groupsFromEntries } from '../ManagerHelper';
import type { UserGroupCreationRecord, UserGroupEntry } from '../Serialize';

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

describe('GroupManagerHelper', () => {
  let testGenerator: TestGenerator;
  let userCreation: TestDeviceCreation;
  let provisionalIdentityManager;
  let localUser;
  let userGroup: TestUserGroup;

  before(() => cryptoReady);

  beforeEach(async () => {
    testGenerator = new TestGenerator();
    testGenerator.makeTrustchainCreation();
    const userId = random(tcrypto.HASH_SIZE);
    userCreation = await testGenerator.makeUserCreation(userId);

    localUser = (({ findUserKey: () => userCreation.testUser.userKeys[0] }: any): LocalUser);
    userGroup = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
    provisionalIdentityManager = (({
      findPrivateProvisionalKeys: () => null,
      refreshProvisionalPrivateKeys: () => null,
    }: any): ProvisionalIdentityManager);
  });

  describe('assertPublicIdentities()', () => {
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
            const group = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
            expect(group).to.deep.equal(userGroup.group);
          });

          it('can create a group with a userGroupCreation action from a provisional user', () => {
            const provisionalResult = testGenerator.makeProvisionalUser();
            // $FlowIgnore[cannot-write]
            provisionalIdentityManager.findPrivateProvisionalKeys = () => provisionalResult.provisionalUserKeys;

            userGroup = testGenerator.makeUserGroupCreation(userCreation, [], [provisionalResult.publicProvisionalUser]);
            const group = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
            expect(group).to.deep.equal(userGroup.group);
          });

          it('can update a group with a userGroupAddition', async () => {
            let group = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroup.group, [userCreation2.user]);

            group = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);
            expect(group).to.deep.equal(userGroupAddition.group);
          });

          it('can update a group with a userGroupAddition from a provisional user', () => {
            let group = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
            const provisionalResult = testGenerator.makeProvisionalUser();
            // $FlowIgnore[cannot-write]
            provisionalIdentityManager.findPrivateProvisionalKeys = () => provisionalResult.provisionalUserKeys;

            const userGroupAddition = makeUserGroupAddition(userCreation, userGroup.group, [], [provisionalResult.publicProvisionalUser]);

            group = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);
            expect(group).to.deep.equal(userGroupAddition.group);
          });

          it('can create a group with a group private signature key in the group addition', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroup.group, [userCreation2.user]);

            localUser = (({ findUserKey: () => null }: any): LocalUser);
            let group = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);

            localUser = (({ findUserKey: () => userCreation2.testUser.userKeys[0] }: any): LocalUser);
            group = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);
            expect(group).to.deep.equal(userGroupAddition.group);
          });
        });

        describe('with external groups', () => {
          beforeEach(() => {
            localUser = (({ findUserKey: () => null }: any): LocalUser);
          });

          it('can create an external group from a userGroupCreation action', () => {
            const externalGroup = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
            expect(externalGroup).to.deep.equal(getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry));
          });

          it('can update an external group from a userGroupCreation action', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroup.group, [userCreation2.user]);

            let resultGroup = getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry);
            resultGroup = getExternalGroupFromUserGroupAddition(userGroupAddition.userGroupEntry, resultGroup);

            let externalGroup = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
            externalGroup = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, externalGroup, localUser, provisionalIdentityManager);
            expect(externalGroup).to.deep.equal(resultGroup);
          });

          it('can create an external group from a userGroupCreation action with a provisional user', () => {
            const provisionalResult = testGenerator.makeProvisionalUser();

            userGroup = testGenerator.makeUserGroupCreation(userCreation, [], [provisionalResult.publicProvisionalUser]);
            const externalGroup = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
            expect(externalGroup).to.deep.equal(getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry));
          });

          it('can update an external group from a userGroupCreation action with a provisional user', () => {
            const provisionalResult = testGenerator.makeProvisionalUser();
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroup.group, [], [provisionalResult.publicProvisionalUser]);

            let resultGroup = getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry);
            resultGroup = getExternalGroupFromUserGroupAddition(userGroupAddition.userGroupEntry, resultGroup);

            let externalGroup = groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
            externalGroup = groupFromUserGroupEntry(userGroupAddition.userGroupEntry, externalGroup, localUser, provisionalIdentityManager);
            expect(externalGroup).to.deep.equal(resultGroup);
          });
        });
      });

      describe('inflateFromBlocks()', () => {
        describe('with userGroupAddition', () => {
          it('can inflate multiple blocks from different groups', async () => {
            const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroupAddition = makeUserGroupAddition(userCreation, userGroup.group, [userCreation2.user]);
            const userCreation3 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
            const userGroup2 = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
            const userGroupAddition2 = makeUserGroupAddition(userCreation, userGroup2.group, [userCreation2.user]);
            const userGroupAddition3 = makeUserGroupAddition(userCreation, userGroupAddition2.group, [userCreation3.user]);

            const entries = [userGroup.userGroupEntry, userGroup2.userGroupEntry, userGroupAddition2.userGroupEntry, userGroupAddition.userGroupEntry, userGroupAddition3.userGroupEntry];

            const devicesPublicSignatureKeys: Map<string, Uint8Array> = new Map();
            devicesPublicSignatureKeys.set(utils.toBase64(userCreation.testDevice.id), userCreation.testDevice.signKeys.publicKey);
            devicesPublicSignatureKeys.set(utils.toBase64(userCreation2.testDevice.id), userCreation2.testDevice.signKeys.publicKey);
            devicesPublicSignatureKeys.set(utils.toBase64(userCreation3.testDevice.id), userCreation3.testDevice.signKeys.publicKey);

            const resultGroups = await groupsFromEntries(entries, devicesPublicSignatureKeys, localUser, provisionalIdentityManager);

            expect(resultGroups.length).to.deep.equal(2);
            expect(resultGroups[0]).to.deep.equal(userGroupAddition.group);
            expect(resultGroups[1]).to.deep.equal(userGroupAddition3.group);
          });
        });
      });
    });
  };
  describeGroupAdditionTests(2);
  describeGroupAdditionTests(3);
});
