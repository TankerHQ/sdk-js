// @flow
import { ready as cryptoReady, tcrypto, random } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { InvalidBlockError } from '../../errors.internal';

import { type Group } from '../types';
import { type UserGroupEntry } from '../Serialize';
import { verifyUserGroupCreation, verifyUserGroupAddition } from '../Verify';
import { type User } from '../../Users/types';

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

    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const provisionalIdentity = testGenerator.makeProvisionalUser().publicProvisionalUser;
      const userGroup = testGenerator.makeUserGroupCreation(userCreation, [user], [provisionalIdentity]);
      userGroupEntry = userGroup.userGroupEntry;
      group = userGroup.group;
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

      beforeEach(async () => {
        testGenerator.makeTrustchainCreation();
        const userId = random(tcrypto.HASH_SIZE);
        const userCreation = await testGenerator.makeUserCreation(userId);
        user = userCreation.user;
        const provisionalIdentity = testGenerator.makeProvisionalUser().publicProvisionalUser;
        const userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [user], [provisionalIdentity]);
        group = userGroupCreation.group;

        // Second user
        const userId2 = random(tcrypto.HASH_SIZE);
        const userCreation2 = await testGenerator.makeUserCreation(userId2);
        const userGroupAddition = makeUserGroupAddition(userCreation, userGroupCreation.group, [userCreation2.user]);

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
});
