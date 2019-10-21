// @flow
import { tcrypto, random } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { InvalidBlockError } from '../errors.internal';

import type { UnverifiedUserGroup } from '../Blocks/entries';
import { type ExternalGroup } from '../Groups/types';
import { verifyUserGroupCreation, verifyUserGroupAddition } from '../Trustchain/Verify';
import { type User } from '../Users/User';

import TestGenerator from './TestGenerator';

function assertFailWithNature(verifyFunc: () => any, nature: string) {
  expect(verifyFunc)
    .to.throw(InvalidBlockError)
    .that.has.property('nature', nature);
}

describe('BlockVerification', () => {
  let testGenerator: TestGenerator;

  beforeEach(() => {
    testGenerator = new TestGenerator();
  });

  describe('group creation', () => {
    let user: User;
    let externalGroup: ExternalGroup;
    let unverifiedUserGroup: UnverifiedUserGroup;

    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const provisionalIdentity = testGenerator.makeProvisionalUser().publicProvisionalUser;
      const userGroup = testGenerator.makeUserGroupCreation(userCreation, [user], [provisionalIdentity]);
      unverifiedUserGroup = userGroup.unverifiedUserGroup;
      externalGroup = userGroup.externalGroup;
    });

    it('should accept a valid group creation', async () => {
      expect(() => verifyUserGroupCreation(unverifiedUserGroup, user.devices[0], null))
        .to.not.throw();
    });
    it('should reject a group creation if it already exists', async () => {
      externalGroup.publicEncryptionKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
      assertFailWithNature(
        () => verifyUserGroupCreation(unverifiedUserGroup, user.devices[0], externalGroup),
        'group_already_exists'
      );
    });

    it('should reject a group creation with bad signature', async () => {
      unverifiedUserGroup.signature[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupCreation(unverifiedUserGroup, user.devices[0], null),
        'invalid_signature'
      );
    });

    it('should reject a group creation with bad self-signature', async () => {
      // $FlowIKnow this is a user group creation
      unverifiedUserGroup.self_signature[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupCreation(unverifiedUserGroup, user.devices[0], null),
        'invalid_self_signature'
      );
    });
  });

  describe('group addition', () => {
    let user: User;
    let externalGroup: ExternalGroup;
    let unverifiedUserGroup: UnverifiedUserGroup;

    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const provisionalIdentity = testGenerator.makeProvisionalUser().publicProvisionalUser;
      const userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [user], [provisionalIdentity]);
      externalGroup = userGroupCreation.externalGroup;

      // Second user
      const userId2 = random(tcrypto.HASH_SIZE);
      const userCreation2 = await testGenerator.makeUserCreation(userId2);
      const userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroupCreation, [userCreation2.user]);

      unverifiedUserGroup = userGroupAddition.unverifiedUserGroup;
    });

    it('should accept a valid group addition', async () => {
      expect(() => verifyUserGroupAddition(unverifiedUserGroup, user.devices[0], externalGroup))
        .to.not.throw();
    });

    it('should reject a group addition with bad signature', async () => {
      unverifiedUserGroup.signature[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupAddition(unverifiedUserGroup, user.devices[0], externalGroup),
        'invalid_signature'
      );
    });

    it('should reject a group addition with bad self-signature', async () => {
      // $FlowIKnow this is a user group creation
      unverifiedUserGroup.self_signature_with_current_key[0] += 1;
      assertFailWithNature(
        () => verifyUserGroupAddition(unverifiedUserGroup, user.devices[0], externalGroup),
        'invalid_self_signature'
      );
    });

    it('should reject a group addition if the group does not exist', async () => {
      assertFailWithNature(
        () => verifyUserGroupAddition(unverifiedUserGroup, user.devices[0], null),
        'invalid_group_id'
      );
    });

    it('should reject a group addition if the group does match', async () => {
      externalGroup.lastGroupBlock = random(tcrypto.HASH_SIZE);
      assertFailWithNature(
        () => verifyUserGroupAddition(unverifiedUserGroup, user.devices[0], externalGroup),
        'invalid_previous_group_block'
      );
    });
  });
});
