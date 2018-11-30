// @flow
import { tcrypto, random, utils } from '@tanker/crypto';

import { expect } from './chai';
import { InvalidBlockError } from '../errors';

import makeUint8Array from './makeUint8Array';

import {
  verifyTrustchainCreation,
  verifyDeviceCreation,
  verifyDeviceRevocation,
  verifyKeyPublish,
  verifyUserGroupCreation,
  verifyUserGroupAddition
} from '../Trustchain/Verify';

import { type User } from '../Users/User';
import { type ExternalGroup } from '../Groups/types';

import type { UnverifiedDeviceCreation, UnverifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import type { UnverifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import type { UnverifiedUserGroup } from '../UnverifiedStore/UserGroupsUnverifiedStore';
import type { UnverifiedTrustchainCreation } from '../Trustchain/TrustchainStore';

import { NATURE } from '../Blocks/Nature';

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

  describe('Trustchain creation', () => {
    let unverifiedTrustchainCreation: UnverifiedTrustchainCreation;
    let trustchainId: Uint8Array;
    beforeEach(() => {
      const testTrustchainCreation = testGenerator.makeTrustchainCreation();
      unverifiedTrustchainCreation = testTrustchainCreation.unverifiedTrustchainCreation;
      trustchainId = testTrustchainCreation.trustchainId;
    });

    it('should reject a root block with an author that is not 0', () => {
      unverifiedTrustchainCreation.author = makeUint8Array('Not 0', 32);
      assertFailWithNature(
        () => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId),
        'invalid_author_for_trustchain_creation'
      );
    });

    it('should reject a root block with a signature that is not 0', () => {
      unverifiedTrustchainCreation.signature = makeUint8Array('Not 0', 32);
      assertFailWithNature(
        () => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId),
        'invalid_signature'
      );
    });

    it('should reject a root block if the hash of the block does not match the trustchainId', () => {
      unverifiedTrustchainCreation.hash = makeUint8Array('Not hash', 32);
      assertFailWithNature(
        () => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId),
        'invalid_root_block'
      );
    });

    it('should accept a root block if all the requirements are met', () => {
      expect(() => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId))
        .not.to.throw();
    });
  });

  describe('device creation', () => {
    let user: User;
    let unverifiedUserCreation: UnverifiedDeviceCreation;
    let unverifiedDeviceCreation: UnverifiedDeviceCreation;
    let trustchainKeys: tcrypto.SodiumKeyPair;

    beforeEach(() => {
      const trustchainCreation = testGenerator.makeTrustchainCreation();
      trustchainKeys = trustchainCreation.trustchainKeys;

      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      const deviceCreation = testGenerator.makeDeviceCreation(userCreation);
      unverifiedUserCreation = userCreation.unverifiedDeviceCreation;
      unverifiedDeviceCreation = deviceCreation.unverifiedDeviceCreation;
      user = userCreation.user;
    });

    it('should accept a valid user creation', () => {
      expect(() => verifyDeviceCreation(unverifiedUserCreation, null, null, trustchainKeys.publicKey, null))
        .not.to.throw();
    });

    it('should reject an incorrectly signed delegation for a device', () => {
      unverifiedUserCreation.delegation_signature[0] += 1;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedUserCreation, null, null, trustchainKeys.publicKey, null),
        'invalid_delegation_signature'
      );
    });
    it('should reject an incorrectly signed user creation', () => {
      unverifiedUserCreation.signature[0] += 1;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedUserCreation, null, null, trustchainKeys.publicKey, null),
        'invalid_signature'
      );
    });

    it('should accept a second deviceCreationV3 if all requirements are met', () => {
      expect(() => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user))
        .not.to.throw();
    });

    it('should reject a device creation by a revoked author', () => {
      user.devices[0].revokedAt = 1;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user),
        'revoked_author_error'
      );
    });

    it('should reject a second device if the parent has a different user_id', () => {
      user.userId = utils.toBase64(random(tcrypto.HASH_SIZE));
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user),
        'forbidden'
      );
    });

    it('should reject a deviceCreationV3 if the userPublicKey is not the same as it\'s parent one', () => {
      user.userPublicKeys[0].userPublicKey = random(tcrypto.HASH_SIZE);
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user),
        'invalid_public_user_key'
      );
    });

    it('should reject a deviceCreationV3 if the parent device is a server, and the new one a client', () => {
      user.devices[0].isServerDevice = true;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user),
        'invalid_author_type'
      );
    });

    it('should reject a deviceCreationV3 if the parent device is a client, and the new one a server', () => {
      unverifiedDeviceCreation.is_server_device = true;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user),
        'invalid_author_type'
      );
    });

    it('should reject a deviceCreationV1 if the user_key is not null', () => {
      unverifiedDeviceCreation.nature = NATURE.device_creation_v1;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user),
        'forbidden'
      );
    });

    it('should accept a deviceCreationV1 if all requirements are met', () => {
      unverifiedUserCreation.nature = NATURE.device_creation_v1;
      expect(() => verifyDeviceCreation(unverifiedUserCreation, null, null, trustchainKeys.publicKey, null))
        .to.not.throw();
    });

    it('should accept a second deviceCreationV1 if all requirements are met', () => {
      unverifiedDeviceCreation.nature = NATURE.device_creation_v1;
      user.userPublicKeys = [];
      expect(() => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user))
        .to.not.throw();
    });
  });

  describe('device revocation', () => {
    let user: User;
    let unverifiedDeviceRevocation: UnverifiedDeviceRevocation;
    let authorKey: Uint8Array;
    beforeEach(() => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      const deviceCreation = testGenerator.makeDeviceCreation(userCreation);
      user = deviceCreation.user;
      const deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation, deviceCreation.testDevice.id);
      unverifiedDeviceRevocation = deviceRevocation.unverifiedDeviceRevocation;
      authorKey = user.devices[1].devicePublicSignatureKey;
    });

    it('should accept a revocation v2 when all requirements are met', () => {
      expect(() => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user)).not.to.throw();
    });

    it('should reject a revocation with an author that is another user', () => {
      const otherUserId = utils.toBase64(random(tcrypto.HASH_SIZE));
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, otherUserId, authorKey, user),
        'forbidden'
      );
    });

    it('should reject a revocation of a device that doesn\'t exist', () => {
      user.devices = [user.devices[0]];
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'invalid_revoked_device'
      );
    });

    it('should reject a revocation with an invalid signature', () => {
      unverifiedDeviceRevocation.signature[0] += 1;
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'invalid_signature'
      );
    });

    it('should reject a revocation of an already revoked device', () => {
      user.devices[1].revokedAt = 1;
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'device_already_revoked'
      );
    });

    it('should reject a revocation v2 with too many elements in the private_keys field', () => {
      // $FlowIKnow user_keys is not null
      unverifiedDeviceRevocation.user_keys.private_keys.push(unverifiedDeviceRevocation.user_keys.private_keys[0]);
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'invalid_new_key'
      );
    });

    it('should reject a revocation v2 with too few elements in the private_keys field', () => {
      // $FlowIKnow user_keys is not null
      unverifiedDeviceRevocation.user_keys.private_keys = [];
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'invalid_new_key'
      );
    });

    it('should reject a revocation v2 with an encrypted_keys_for_devices that does not target the users devices', () => {
      // $FlowIKnow user_keys is not null
      unverifiedDeviceRevocation.user_keys.private_keys[0].recipient = random(tcrypto.HASH_SIZE);
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'invalid_new_key'
      );
    });

    it('should reject a revocation v1 if the user has a user key', () => {
      unverifiedDeviceRevocation.nature = NATURE.device_revocation_v1;
      delete unverifiedDeviceRevocation.user_keys;
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'invalid_revocation_version'
      );
    });

    it('should accept a revocation v1 when all requirements are met', () => {
      unverifiedDeviceRevocation.nature = NATURE.device_revocation_v1;
      delete unverifiedDeviceRevocation.user_keys;
      user.userPublicKeys = [];
      expect(() => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user))
        .to.not.throw();
    });
  });

  describe('key publish to device', () => {
    let user: User;
    let unverifiedKeyPublish: UnverifiedKeyPublish;
    beforeEach(() => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      const deviceCreation = testGenerator.makeDeviceCreation(userCreation);
      user = deviceCreation.user;
      user.userPublicKeys = [];
      const keyPublish = testGenerator.makeKeyPublishToDevice(deviceCreation, user.devices[0]);
      unverifiedKeyPublish = keyPublish.unverifiedKeyPublish;
    });

    it('should accept a correct key publish to device', () => {
      expect(() => verifyKeyPublish(unverifiedKeyPublish, user.devices[1], user, null))
        .to.not.throw();
    });

    it('should reject a keyPublish with an invalid signature', () => {
      unverifiedKeyPublish.signature[0] += 1;
      assertFailWithNature(
        () => verifyKeyPublish(unverifiedKeyPublish, user.devices[1], user, null),
        'invalid_signature'
      );
    });

    it('should reject a keyPublish to device with no recipient', () => {
      assertFailWithNature(
        () => verifyKeyPublish(unverifiedKeyPublish, user.devices[1], null, null),
        'invalid_recipient'
      );
    });
  });

  describe('key publish to user', () => {
    let user: User;
    let unverifiedKeyPublish: UnverifiedKeyPublish;
    beforeEach(() => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      testGenerator.skipIndex(); // used for faking a revocation
      const keyPublish = testGenerator.makeKeyPublishToUser(userCreation, user);
      unverifiedKeyPublish = keyPublish.unverifiedKeyPublish;
    });

    it('should accept a correct key publish to user', () => {
      expect(() => verifyKeyPublish(unverifiedKeyPublish, user.devices[0], user, null))
        .to.not.throw();
    });

    it('should reject a keyPublish with an invalid signature', () => {
      unverifiedKeyPublish.signature[0] += 1;
      assertFailWithNature(
        () => verifyKeyPublish(unverifiedKeyPublish, user.devices[0], user, null),
        'invalid_signature'
      );
    });
    it('should reject a key publish to user with a recipient that has a superseeded user public key', () => {
      user.userPublicKeys.push({ index: unverifiedKeyPublish.index - 1, userPublicKey: random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE) });
      assertFailWithNature(
        () => verifyKeyPublish(unverifiedKeyPublish, user.devices[0], user, null),
        'invalid_user_public_key'
      );
    });
    it('should reject a keyPublish to user with no recipient', () => {
      assertFailWithNature(
        () => verifyKeyPublish(unverifiedKeyPublish, user.devices[0], null, null),
        'invalid_recipient'
      );
    });
  });

  describe('group creation', () => {
    let user: User;
    let externalGroup: ExternalGroup;
    let unverifiedUserGroup: UnverifiedUserGroup;

    beforeEach(() => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const userGroup = testGenerator.makeUserGroupCreation(userCreation, [user]);
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

    beforeEach(() => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [user]);
      externalGroup = userGroupCreation.externalGroup;

      // Second user
      const userId2 = random(tcrypto.HASH_SIZE);
      const userCreation2 = testGenerator.makeUserCreation(userId2);
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

  describe('key publish to user group', () => {
    let user: User;
    let externalGroup: ExternalGroup;
    let unverifiedKeyPublish: UnverifiedKeyPublish;
    beforeEach(() => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [user]);
      externalGroup = userGroupCreation.externalGroup;

      const keyPublish = testGenerator.makeKeyPublishToGroup(userCreation, externalGroup);
      unverifiedKeyPublish = keyPublish.unverifiedKeyPublish;
    });

    it('should accept a valid kp2ug', async () => {
      expect(() => verifyKeyPublish(unverifiedKeyPublish, user.devices[0], user, externalGroup))
        .to.not.throw();
    });

    it('should reject a keyPublish with an invalid signature', () => {
      unverifiedKeyPublish.signature[0] += 1;
      assertFailWithNature(
        () => verifyKeyPublish(unverifiedKeyPublish, user.devices[0], user, externalGroup),
        'invalid_signature'
      );
    });

    it('should reject a kp2ug with a bad recipient', async () => {
      assertFailWithNature(
        () => verifyKeyPublish(unverifiedKeyPublish, user.devices[0], user, null),
        'invalid_recipient'
      );
    });
  });
});
