import { ready as cryptoReady } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { TestGenerator } from '../../__tests__/TestGenerator';
import { makeUint8Array } from '../../__tests__/makeUint8Array';
import { assertFailWithNature } from '../../__tests__/assertFailWithNature';

import { verifyTrustchainCreation } from '../Verify';
import type { TrustchainCreationEntry } from '../Serialize';

import { NATURE } from '../../Blocks/Nature';

describe('BlockVerification', () => {
  let testGenerator: TestGenerator;

  before(() => cryptoReady);

  beforeEach(() => {
    testGenerator = new TestGenerator();
  });

  describe('Trustchain creation', () => {
    let unverifiedTrustchainCreation: TrustchainCreationEntry;
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
        'invalid_author_for_trustchain_creation',
      );
    });

    it('should reject a root block with a signature that is not 0', () => {
      unverifiedTrustchainCreation.signature = makeUint8Array('Not 0', 32);
      assertFailWithNature(
        () => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId),
        'invalid_signature',
      );
    });

    it('should reject a root block if the hash of the block does not match the trustchainId', () => {
      unverifiedTrustchainCreation.hash = makeUint8Array('Not hash', 32);
      assertFailWithNature(
        () => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId),
        'invalid_root_block',
      );
    });

    it('should reject a root block if it has invalid nature', () => {
      unverifiedTrustchainCreation.nature = NATURE.user_group_addition_v1;
      assertFailWithNature(
        () => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId),
        'invalid_nature',
      );
    });

    it('should accept a root block if all the requirements are met', () => {
      expect(() => verifyTrustchainCreation(unverifiedTrustchainCreation, trustchainId))
        .not.to.throw();
    });
  });
});
