// @flow
import { tcrypto, random, utils } from '@tanker/crypto';
import { GroupTooBig, InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { MAX_GROUP_SIZE, assertPublicIdentities, groupFromUserGroupEntry, inflateFromBlocks } from '../Groups/ManagerHelper';
import { type UserGroupCreationRecord, type UserGroupEntry } from '../Groups/Serialize';
import { type ExternalGroup } from '../Groups/types';

import { serializeBlock } from '../Blocks/payloads';
import TestGenerator, { getKeyStoreOfDevice, type TestDeviceCreation, type TestUserGroup } from './TestGenerator';
import KeyStore from '../Session/LocalUser/KeyStore';
import ProvisionalIdentityManager from '../Session/ProvisionalIdentity/ProvisionalIdentityManager';

describe('GroupManagerHelper', () => {
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
    let testGenerator: TestGenerator;

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

    let provisionalIdentityManager;

    beforeEach(() => {
      testGenerator = new TestGenerator();
      provisionalIdentityManager = (({}: any): ProvisionalIdentityManager);
    });

    describe('with internal groups', () => {
      let userCreation: TestDeviceCreation;
      let userGroup: TestUserGroup;
      let keyStore: KeyStore;
      let userGroupCreation: UserGroupCreationRecord;

      beforeEach(async () => {
        testGenerator.makeTrustchainCreation();
        const userId = random(tcrypto.HASH_SIZE);
        userCreation = await testGenerator.makeUserCreation(userId);
        userGroup = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
        keyStore = await getKeyStoreOfDevice(userCreation.testUser, userCreation.testDevice);
        userGroupCreation = (userGroup.userGroupEntry: any);
        provisionalIdentityManager = (({}: any): ProvisionalIdentityManager);
      });

      it('can create a group with a userGroupCreation action', async () => {
        const group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroup.group);
      });

      it('can create a group with a userGroupCreation action from a provisional user', async () => {
        const provisionalResult = await testGenerator.makeProvisionalUser();
        provisionalIdentityManager = (({ getPrivateProvisionalKeys: () => provisionalResult.provisionalUserKeys }: any): ProvisionalIdentityManager);

        keyStore = await getKeyStoreOfDevice(userCreation.testUser, userCreation.testDevice, [provisionalResult.provisionalUserKeys]);
        userGroup = testGenerator.makeUserGroupCreation(userCreation, [], [provisionalResult.publicProvisionalUser]);
        const group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroup.group);
      });

      it('can update a group with a userGroupAddition', async () => {
        let group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup, [userCreation2.user]);
        keyStore = await getKeyStoreOfDevice(userCreation2.testUser, userCreation2.testDevice);
        group = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, keyStore, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroupAddition.group);
      });

      it('can update a group with a userGroupAddition from a provisional user', async () => {
        let group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        const provisionalResult = await testGenerator.makeProvisionalUser();
        provisionalIdentityManager = (({ getPrivateProvisionalKeys: () => provisionalResult.provisionalUserKeys }: any): ProvisionalIdentityManager);

        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup, [], [provisionalResult.publicProvisionalUser]);
        keyStore = await getKeyStoreOfDevice(userCreation.testUser, userCreation.testDevice);
        group = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, keyStore, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroupAddition.group);
      });

      it('can create a group with a group private signature key in the group addition', async () => {
        const encryptedGroupPrivateEncryptionKey = userGroupCreation.encrypted_group_private_encryption_keys_for_users[0];
        userGroup.userGroupEntry.encrypted_group_private_encryption_keys_for_users = [];
        keyStore = await getKeyStoreOfDevice(userCreation.testUser, userCreation.testDevice);
        let group = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));

        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup, [userCreation2.user]);

        const encryptedGroupPrivateEncryptionKeyForUsers = [...userGroupAddition.userGroupEntry.encrypted_group_private_encryption_keys_for_users];
        encryptedGroupPrivateEncryptionKeyForUsers.push(encryptedGroupPrivateEncryptionKey);
        userGroupAddition.userGroupEntry.encrypted_group_private_encryption_keys_for_users = encryptedGroupPrivateEncryptionKeyForUsers;

        group = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, group, keyStore, provisionalIdentityManager);
        expect(group).to.deep.equal(userGroupAddition.group);
      });
    });

    describe('with external groups', () => {
      let userCreation: TestDeviceCreation;
      let userGroup: TestUserGroup;

      // $FlowIKnow
      const keyStore: KeyStore = {
        findUserKey: () => null,
        findProvisionalKey: () => null,
      };

      beforeEach(async () => {
        testGenerator.makeTrustchainCreation();
        const userId = random(tcrypto.HASH_SIZE);
        userCreation = await testGenerator.makeUserCreation(userId);
        userGroup = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
        provisionalIdentityManager = (({}: any): ProvisionalIdentityManager);
      });

      it('can create an external group from a userGroupCreation action', async () => {
        const externalGroup = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        expect(externalGroup).to.deep.equal(getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry));
      });

      it('can update an external group from a userGroupCreation action', async () => {
        const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup, [userCreation2.user]);

        let resultGroup = getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry);
        resultGroup = getExternalGroupFromUserGroupAddition(userGroupAddition.userGroupEntry, resultGroup);

        let externalGroup = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        externalGroup = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, externalGroup, keyStore, provisionalIdentityManager);
        expect(externalGroup).to.deep.equal(resultGroup);
      });

      it('can create an external group from a userGroupCreation action with a provisional user', async () => {
        const provisionalResult = await testGenerator.makeProvisionalUser();
        provisionalIdentityManager = (({ getPrivateProvisionalKeys: () => null }: any): ProvisionalIdentityManager);

        userGroup = testGenerator.makeUserGroupCreation(userCreation, [], [provisionalResult.publicProvisionalUser]);
        const externalGroup = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        expect(externalGroup).to.deep.equal(getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry));
      });

      it('can update an external group from a userGroupCreation action with a provisional user', async () => {
        const provisionalResult = await testGenerator.makeProvisionalUser();
        provisionalIdentityManager = (({ getPrivateProvisionalKeys: () => null }: any): ProvisionalIdentityManager);
        const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup, [], [provisionalResult.publicProvisionalUser]);

        let resultGroup = getExternalGroupFromUserGroupCreation(userGroup.userGroupEntry);
        resultGroup = getExternalGroupFromUserGroupAddition(userGroupAddition.userGroupEntry, resultGroup);

        let externalGroup = await groupFromUserGroupEntry(userGroup.userGroupEntry, null, keyStore, provisionalIdentityManager);
        externalGroup = await groupFromUserGroupEntry(userGroupAddition.userGroupEntry, externalGroup, keyStore, provisionalIdentityManager);
        expect(externalGroup).to.deep.equal(resultGroup);
      });
    });
  });

  describe('inflateFromBlocks()', () => {
    it('can inflate multiple blocks from different groups', async () => {
      const testGenerator = new TestGenerator();
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      const userGroup = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
      const userCreation2 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
      const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroup, [userCreation2.user]);
      const userCreation3 = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
      const userGroup2 = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user], []);
      const userGroupAddition2 = testGenerator.makeUserGroupAddition(userCreation, userGroup2, [userCreation2.user]);
      const userGroupAddition3 = testGenerator.makeUserGroupAddition(userCreation, userGroup2, [userCreation3.user]);

      const keyStore = await getKeyStoreOfDevice(userCreation.testUser, userCreation.testDevice);
      const provisionalIdentityManager = (({}: any): ProvisionalIdentityManager);

      const blocks = [userGroup.block, userGroup2.block, userGroupAddition2.block, userGroupAddition.block, userGroupAddition3.block].map(b => utils.toBase64(serializeBlock(b)));

      const resultGroups = await inflateFromBlocks(blocks, keyStore, provisionalIdentityManager);

      expect(resultGroups.length).to.deep.equal(2);
      const groupData = resultGroups[0];
      expect(groupData[groupData.length - 1].group).to.deep.equal(userGroupAddition.group);
      const groupData2 = resultGroups[1];
      expect(groupData2[groupData2.length - 1].group).to.deep.equal(userGroupAddition3.group);
    });
  });
});
