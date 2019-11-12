// @flow
import { tcrypto, random, utils } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { InvalidBlockError } from '../errors.internal';

import makeUint8Array from './makeUint8Array';

import {
  verifyTrustchainCreation,
  verifyDeviceCreation,
  verifyDeviceRevocation,
  verifyProvisionalIdentityClaim,
} from '../Trustchain/Verify';

import { type User } from '../Users/User';

import type {
  UnverifiedTrustchainCreation,
  UnverifiedDeviceCreation, UnverifiedDeviceRevocation, UnverifiedProvisionalIdentityClaim,
} from '../Blocks/entries';

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

    it('should reject a root block if it has invalid nature', () => {
      unverifiedTrustchainCreation.nature = NATURE.user_group_addition_v1;
      assertFailWithNature(
        () => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId),
        'invalid_nature'
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

    beforeEach(async () => {
      const trustchainCreation = testGenerator.makeTrustchainCreation();
      trustchainKeys = trustchainCreation.trustchainKeys;

      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
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

    it('should reject a deviceCreationV3 if last_reset is not null', () => {
      unverifiedDeviceCreation.last_reset = new Uint8Array([1]);
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, user.devices[0], user.devices[0].devicePublicSignatureKey, user),
        'invalid_last_reset'
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
    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
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

    it('should reject a revocation v2 if could not find revoked user in user store', () => {
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, null),
        'invalid_revoked_user'
      );
    });

    it('should reject a revocation v2 if user keys are missing', () => {
      // $FlowExpectedError
      unverifiedDeviceRevocation.user_keys = null;
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'missing_user_keys'
      );
    });

    it('should reject a revocation v2 if previous public user encryption key does not match', () => {
      // $FlowIKnow user_keys is not null
      unverifiedDeviceRevocation.user_keys.previous_public_encryption_key = new Uint8Array([1]);
      assertFailWithNature(
        () => verifyDeviceRevocation(unverifiedDeviceRevocation, user.userId, authorKey, user),
        'invalid_previous_key'
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

  describe('claim provisional identity', () => {
    let user: User;
    let unverifiedProvisionalIdentityClaim: UnverifiedProvisionalIdentityClaim;
    let userId: Uint8Array;

    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const userPublicKey = userCreation.testUser.userKeys.slice(-1)[0].publicKey;
      const claim = testGenerator.makeProvisionalIdentityClaim(userCreation, userId, userPublicKey);
      unverifiedProvisionalIdentityClaim = claim.unverifiedProvisionalIdentityClaim;
    });

    it('should accept a valid claim', async () => {
      expect(() => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0], userId))
        .to.not.throw();
    });

    it('should reject a claim with an invalid author', async () => {
      unverifiedProvisionalIdentityClaim.user_id[0] += 1;
      assertFailWithNature(
        () => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0], userId),
        'invalid_author'
      );
    });

    it('should reject a claim with an invalid signature', async () => {
      unverifiedProvisionalIdentityClaim.signature[0] += 1;
      assertFailWithNature(
        () => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0], userId),
        'invalid_signature'
      );
    });

    it('should reject a claim with an invalid app signature', async () => {
      unverifiedProvisionalIdentityClaim.author_signature_by_app_key[0] += 1;
      assertFailWithNature(
        () => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0], userId),
        'invalid_signature'
      );
    });

    it('should reject a claim with an invalid tanker signature', async () => {
      unverifiedProvisionalIdentityClaim.author_signature_by_tanker_key[0] += 1;
      assertFailWithNature(
        () => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0], userId),
        'invalid_signature'
      );
    });
  });
});
