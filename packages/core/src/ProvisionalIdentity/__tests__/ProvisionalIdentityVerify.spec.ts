import { expect } from '@tanker/test-utils';
import { ready as cryptoReady, tcrypto, random } from '@tanker/crypto';

import type { User } from '../../Users/types';
import type { ClaimEntry } from '../Serialize';
import { verifyProvisionalIdentityClaim } from '../Verify';

import { TestGenerator } from '../../__tests__/TestGenerator';
import { assertFailWithNature } from '../../__tests__/assertFailWithNature';

describe('BlockVerification', () => {
  let testGenerator: TestGenerator;

  before(() => cryptoReady);

  beforeEach(() => {
    testGenerator = new TestGenerator();
  });

  describe('claim provisional identity', () => {
    let user: User;
    let unverifiedProvisionalIdentityClaim: ClaimEntry;
    let userId: Uint8Array;

    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      user = userCreation.user;
      const userPublicKey = userCreation.testUser.userKeys.slice(-1)[0]!.publicKey;
      const claim = testGenerator.makeProvisionalIdentityClaim(userCreation, userId, userPublicKey);
      unverifiedProvisionalIdentityClaim = claim.unverifiedProvisionalIdentityClaim;
    });

    it('should accept a valid claim', async () => {
      expect(() => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0]!.devicePublicSignatureKey, userId))
        .to.not.throw();
    });

    it('should reject a claim with an invalid author', async () => {
      unverifiedProvisionalIdentityClaim.user_id[0] += 1;
      assertFailWithNature(
        () => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0]!.devicePublicSignatureKey, userId),
        'invalid_author',
      );
    });

    it('should reject a claim with an invalid signature', async () => {
      unverifiedProvisionalIdentityClaim.signature[0] += 1;
      assertFailWithNature(
        () => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0]!.devicePublicSignatureKey, userId),
        'invalid_signature',
      );
    });

    it('should reject a claim with an invalid app signature', async () => {
      unverifiedProvisionalIdentityClaim.author_signature_by_app_key[0] += 1;
      assertFailWithNature(
        () => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0]!.devicePublicSignatureKey, userId),
        'invalid_signature',
      );
    });

    it('should reject a claim with an invalid tanker signature', async () => {
      unverifiedProvisionalIdentityClaim.author_signature_by_tanker_key[0] += 1;
      assertFailWithNature(
        () => verifyProvisionalIdentityClaim(unverifiedProvisionalIdentityClaim, user.devices[0]!.devicePublicSignatureKey, userId),
        'invalid_signature',
      );
    });
  });
});
