// @flow
import { expect } from '@tanker/test-utils';

import { InvalidBlockError } from '../errors.internal';

import makeUint8Array from './makeUint8Array';

import { verifyTrustchainCreation } from '../Session/LocalUser/Verify';

import type { TrustchainCreationEntry } from '../Session/LocalUser/Serialize';

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
});
