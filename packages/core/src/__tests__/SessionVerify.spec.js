// @flow
import { expect } from '@tanker/test-utils';

import { tcrypto, random } from '@tanker/crypto';

import { InvalidBlockError } from '../errors.internal';

import makeUint8Array from './makeUint8Array';

import { type User } from '../Users/types';
import {
  verifyTrustchainCreation,
  verifyProvisionalIdentityClaim,
} from '../Session/Verify';

import type {
  UnverifiedTrustchainCreation,
  UnverifiedProvisionalIdentityClaim,
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
