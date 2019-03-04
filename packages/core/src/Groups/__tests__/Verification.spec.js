// @flow
import { ready as cryptoReady, tcrypto, random } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { InvalidBlockError } from '../../errors.internal';

import { type Group } from '../types';
import { type UserGroupEntry } from '../Serialize';
import { verifyUserGroupCreation, verifyUserGroupAddition, verifyUserGroupUpdate } from '../Verify';
import { type User } from '../../Users/types';
import ProvisionalIdentityManager from '../../ProvisionalIdentity/Manager';
import LocalUser from '../../LocalUser/LocalUser';
import { groupFromUserGroupEntry } from '../ManagerHelper';

import TestGenerator from '../../__tests__/TestGenerator';

function assertFailWithNature(verifyFunc: () => any, nature: string) {
  expect(verifyFunc)
    .to.throw(InvalidBlockError)
    .that.has.property('nature', nature);
}

describe('BlockVerification', () => {
  let testGenerator: TestGenerator;

  before(() => cryptoReady);

  beforeEach(() => {
    testGenerator = new TestGenerator();
  });

  describe('group creation', () => {
    let user: User;
    let group: Group;
    let userGroupEntry: UserGroupEntry;
    let provisionalIdentityManager;
    let localUser;

    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const provisionalIdentity = testGenerator.makeProvisionalUser().publicProvisionalUser;
      localUser = (({ findUserKey: () => userCreation.testUser.userKeys[0] }: any): LocalUser);
      provisionalIdentityManager = (({
        findPrivateProvisionalKeys: () => null,
        refreshProvisionalPrivateKeys: () => null,
      }: any): ProvisionalIdentityManager);

      const userGroup = testGenerator.makeUserGroupCreation(userCreation, [user], [provisionalIdentity]);
      userGroupEntry = userGroup.userGroupEntry;
      group = groupFromUserGroupEntry(userGroupEntry, null, localUser, provisionalIdentityManager);
    });

    it('should accept a valid group creation', async () => {
      expect(() => verifyUserGroupCreation(userGroupEntry, user.devices[0].devicePublicSignatureKey, null))
        .to.not.throw();
    });
    it('should reject a group creation if it already exists', async () => {
      group.lastPublicEncryptionKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
      assertFailWithNature(
        () => verifyUserGroupCreation(userGroupEntry, user.devices[0].devicePublicSignatureKey, group),
        'group_already_exists'
      );
    });

    it('should reject a group creation with bad signature', async () => {
      userGroupEntry.signature[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupCreation(userGroupEntry, user.devices[0].devicePublicSignatureKey, null),
        'invalid_signature'
      );
    });

    it('should reject a group creation with bad self-signature', async () => {
      // $FlowIgnore this is a user group creation
      userGroupEntry.self_signature[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupCreation(userGroupEntry, user.devices[0].devicePublicSignatureKey, null),
        'invalid_self_signature'
      );
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

    describe(`group addition v${version}`, () => {
      let user: User;
      let group: Group;
      let userGroupEntry: UserGroupEntry;
      let provisionalIdentityManager;
      let localUser;

      beforeEach(async () => {
        testGenerator.makeTrustchainCreation();
        const userId = random(tcrypto.HASH_SIZE);
        const userCreation = await testGenerator.makeUserCreation(userId);
        user = userCreation.user;
        const provisionalIdentity = testGenerator.makeProvisionalUser().publicProvisionalUser;
        localUser = (({ findUserKey: () => userCreation.testUser.userKeys[0] }: any): LocalUser);
        provisionalIdentityManager = (({
          findPrivateProvisionalKeys: () => null,
          refreshProvisionalPrivateKeys: () => null,
        }: any): ProvisionalIdentityManager);

        const userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [user], [provisionalIdentity]);
        group = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);

        // Second user
        const userId2 = random(tcrypto.HASH_SIZE);
        const userCreation2 = await testGenerator.makeUserCreation(userId2);
        const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation, [userCreation2.user]);

        userGroupEntry = userGroupAddition.userGroupEntry;
      });

      it('should accept a valid group addition', async () => {
        expect(() => verifyUserGroupAddition(userGroupEntry, user.devices[0].devicePublicSignatureKey, group))
          .to.not.throw();
      });

      it('should reject a group addition with bad signature', async () => {
        userGroupEntry.signature[0] += 1;
        assertFailWithNature(
          () => verifyUserGroupAddition(userGroupEntry, user.devices[0].devicePublicSignatureKey, group),
          'invalid_signature'
        );
      });

      it('should reject a group addition with bad self-signature', async () => {
      // $FlowIgnore this is a user group creation
        userGroupEntry.self_signature_with_current_key[0] += 1;
        assertFailWithNature(
          () => verifyUserGroupAddition(userGroupEntry, user.devices[0].devicePublicSignatureKey, group),
          'invalid_self_signature'
        );
      });

      it('should reject a group addition if the group does not exist', async () => {
        assertFailWithNature(
          () => verifyUserGroupAddition(userGroupEntry, user.devices[0].devicePublicSignatureKey, null),
          'invalid_group_id'
        );
      });
    });
  };
  describeGroupAdditionTests(2);
  describeGroupAdditionTests(3);

  describe('group update', () => {
    let user: User;
    let group: Group;
    let userGroupEntry: UserGroupEntry;
    let provisionalIdentityManager;
    let localUser;

    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const provisionalUser = testGenerator.makeProvisionalUser();
      const provisionalIdentity = provisionalUser.publicProvisionalUser;
      localUser = (({ findUserKey: () => userCreation.testUser.userKeys[0] }: any): LocalUser);
      provisionalIdentityManager = (({
        findPrivateProvisionalKeys: () => null,
        refreshProvisionalPrivateKeys: () => null,
      }: any): ProvisionalIdentityManager);

      const userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [user], [provisionalIdentity]);
      group = groupFromUserGroupEntry(userGroupCreation.userGroupEntry, null, localUser, provisionalIdentityManager);

      const userGroupUpdate = testGenerator.makeUserGroupUpdate(userCreation, userGroupCreation, [], [], [], [provisionalUser.publicProvisionalIdentity]);
      userGroupEntry = userGroupUpdate.userGroupEntry;
    });

    it('should accept a valid group update', async () => {
      expect(() => verifyUserGroupUpdate(userGroupEntry, user.devices[0].devicePublicSignatureKey, group))
        .to.not.throw();
    });

    it('should reject a group update with bad signature', async () => {
      userGroupEntry.signature[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupUpdate(userGroupEntry, user.devices[0].devicePublicSignatureKey, group),
        'invalid_signature'
      );
    });

    it('should reject a group update with bad self-signature with current key', async () => {
    // $FlowIgnore this is a user group creation
      userGroupEntry.self_signature_with_current_key[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupUpdate(userGroupEntry, user.devices[0].devicePublicSignatureKey, group),
        'invalid_self_signature_with_current_key'
      );
    });

    it('should reject a group update with bad self-signature with previous key', async () => {
    // $FlowIgnore this is a user group creation
      userGroupEntry.self_signature_with_previous_key[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupUpdate(userGroupEntry, user.devices[0].devicePublicSignatureKey, group),
        'invalid_self_signature_with_previous_key'
      );
    });

    it('should reject a group update if the group does not exist', async () => {
      assertFailWithNature(
        () => verifyUserGroupUpdate(userGroupEntry, user.devices[0].devicePublicSignatureKey, null),
        'invalid_group_id'
      );
    });

    it('should reject a group update if the last key rotation block does not match', async () => {
      group.lastKeyRotationBlock = random(tcrypto.HASH_SIZE);
      assertFailWithNature(
        () => verifyUserGroupUpdate(userGroupEntry, user.devices[0].devicePublicSignatureKey, group),
        'invalid_previous_key_rotation_block'
      );
    });
  });
});
