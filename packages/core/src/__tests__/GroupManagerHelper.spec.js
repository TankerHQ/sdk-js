// @flow
import { tcrypto, random, utils } from '@tanker/crypto';
import { GroupTooBig, InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { MAX_GROUP_SIZE, assertPublicIdentities, groupFromUserGroupEntry, groupsFromEntries } from '../Groups/ManagerHelper';
import { type UserGroupCreationRecord, type UserGroupEntry } from '../Groups/Serialize';
import { type ExternalGroup } from '../Groups/types';

import TestGenerator, { type TestDeviceCreation, type TestUserGroup } from './TestGenerator';
import ProvisionalIdentityManager from '../Session/ProvisionalIdentity/ProvisionalIdentityManager';
import LocalUser from '../Session/LocalUser/LocalUser';


function getExternalGroupFromUserGroupCreation(userGroupEntry: UserGroupEntry): ExternalGroup {
  const userGroupCreation: UserGroupCreationRecord = (userGroupEntry: any);

  return {
    groupId: userGroupCreation.public_signature_key,
    publicSignatureKey: userGroupCreation.public_signature_key,
    publicEncryptionKey: userGroupCreation.public_encryption_key,
    lastGroupBlock: userGroupEntry.hash,
    encryptedPrivateSignatureKey: userGroupCreation.encrypted_group_private_signature_key,
    index: userGroupEntry.index,
  };
}

function getExternalGroupFromUserGroupAddition(userGroupEntry: UserGroupEntry, previousGroup: ExternalGroup): ExternalGroup {
  const externalGroup: ExternalGroup = {
    ...previousGroup,
    lastGroupBlock: userGroupEntry.hash,
    index: userGroupEntry.index,
  };
  return externalGroup;
}

describe('GroupManagerHelper', () => {
  let testGenerator: TestGenerator;
  let userCreation: TestDeviceCreation;
  let provisionalIdentityManager;
  let localUser;
  let userGroup: TestUserGroup;

  beforeEach(async () => {
    testGenerator = new TestGenerator();
    testGenerator.makeTrustchainCreation();
    const userId = random(tcrypto.HASH_SIZE);
    userCreation = await testGenerator.makeUserCreation(userId);

    provisionalIdentityManager = (({}: any): ProvisionalIdentityManager);
    localUser = (({ findUserKey: () => userCreation.testUser.userKeys[0] }: any): LocalUser);
    userGroup = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
    provisionalIdentityManager = (({}: any): ProvisionalIdentityManager);
  });

  describe('assertPublicIdentities()', () => {
    it('throws when creating a group with 0 members', () => {
      expect(() => assertPublicIdentities([])).to.throw(InvalidArgument);
    });

    it('throws when creating a group with 1001 members', () => {
      const users = Array.from({ length: MAX_GROUP_SIZE + 1 }, () => 'bob');
      expect(() => assertPublicIdentities(users)).to.throw(GroupTooBig);
    });
  });

  describe('groupFromUserGroupEntry()', () => {
    describe('with internal groups', () => {
      it('can create a group with a userGroupCreation action', async () => {
        const group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroup.group);
      });

      it('can create a group with a userGroupCreation action from a provisional user', async () => {
        const provisionalResult = await testGenerator.makeProvisionalUser();
        provisionalIdentityManager = (({ getPrivateProvisionalKeys: () => provisionalResult.provisionalUserKeys }: any): ProvisionalIdentityManager);

        userGroup = testGenerator.makeUserGroupCreation(userCreation, [], [provisionalResult.publicProvisionalUser]);
        const group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroup.group);
      });

      it('can update a group with a userGroupAddition', async () => {
        let group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
        const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup.group, [userCreation2.user]);

        group = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroupAddition.group);
      });

      it('can update a group with a userGroupAddition from a provisional user', async () => {
        let group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
        const provisionalResult = await testGenerator.makeProvisionalUser();
        provisionalIdentityManager = (({ getPrivateProvisionalKeys: () => provisionalResult.provisionalUserKeys }: any): ProvisionalIdentityManager);

        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup.group, [], [provisionalResult.publicProvisionalUser]);

        group = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroupAddition.group);
      });

      it('can create a group with a group private signature key in the group addition', async () => {
        const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup.group, [userCreation2.user]);

        localUser = (({ findUserKey: () => null }: any): LocalUser);
        let group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);

        localUser = (({ findUserKey: () => userCreation2.testUser.userKeys[0] }: any): LocalUser);
        group = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, localUser, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroupAddition.group);
      });
    });

    describe('with external groups', () => {
      beforeEach(() => {
        localUser = (({ findUserKey: () => null }: any): LocalUser);
      });

      it('can create an external group from a userGroupCreation action', async () => {
        const externalGroup = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
        expect(externalGroup).to.deep.equal(getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry));
      });

      it('can update an external group from a userGroupCreation action', async () => {
        const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup.group, [userCreation2.user]);

        let resultGroup = getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry);
        resultGroup = getExternalGroupFromUserGroupAddition(userGroupAddition.userGroupEntry, resultGroup);

        let externalGroup = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
        externalGroup = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, externalGroup, localUser, provisionalIdentityManager);
        expect(externalGroup).to.deep.equal(resultGroup);
      });

      it('can create an external group from a userGroupCreation action with a provisional user', async () => {
        const provisionalResult = await testGenerator.makeProvisionalUser();
        provisionalIdentityManager = (({ getPrivateProvisionalKeys: () => null }: any): ProvisionalIdentityManager);

        userGroup = testGenerator.makeUserGroupCreation(userCreation, [], [provisionalResult.publicProvisionalUser]);
        const externalGroup = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
        expect(externalGroup).to.deep.equal(getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry));
      });

      it('can update an external group from a userGroupCreation action with a provisional user', async () => {
        const provisionalResult = await testGenerator.makeProvisionalUser();
        provisionalIdentityManager = (({ getPrivateProvisionalKeys: () => null }: any): ProvisionalIdentityManager);
        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup.group, [], [provisionalResult.publicProvisionalUser]);

        let resultGroup = getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry);
        resultGroup = getExternalGroupFromUserGroupAddition(userGroupAddition.userGroupEntry, resultGroup);

        let externalGroup = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, localUser, provisionalIdentityManager);
        externalGroup = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, externalGroup, localUser, provisionalIdentityManager);
        expect(externalGroup).to.deep.equal(resultGroup);
      });
    });
  });

  describe('inflateFromBlocks()', () => {
    it('can inflate multiple blocks from different groups', async () => {
      const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
      const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup.group, [userCreation2.user]);
      const userCreation3 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
      const userGroup2 = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
      const userGroupAddition2 = testGenerator.makeUserGroupAddition(userCreation, userGroup2.group, [userCreation2.user]);
      const userGroupAddition3 = testGenerator.makeUserGroupAddition(userCreation, userGroupAddition2.group, [userCreation3.user]);

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
