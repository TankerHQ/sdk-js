import { ready as cryptoReady, tcrypto, random } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import TestGenerator from '../../__tests__/TestGenerator';
import { assertFailWithNature } from '../../__tests__/assertFailWithNature';

import { verifyDeviceCreation } from '../Verify';
import type { DeviceCreationEntry } from '../Serialize';
import type { User } from '../types';

import { NATURE } from '../../Blocks/Nature';

describe('BlockVerification', () => {
  let testGenerator: TestGenerator;

  before(() => cryptoReady);

  beforeEach(() => {
    testGenerator = new TestGenerator();
  });

  describe('device creation', () => {
    let user: User;
    let unverifiedUserCreation: DeviceCreationEntry;
    let unverifiedDeviceCreation: DeviceCreationEntry;
    let trustchainId: Uint8Array;
    let trustchainKeys: tcrypto.SodiumKeyPair;

    beforeEach(async () => {
      const trustchainCreation = testGenerator.makeTrustchainCreation();
      trustchainId = trustchainCreation.trustchainId;
      trustchainKeys = trustchainCreation.trustchainKeys;

      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = await testGenerator.makeUserCreation(userId);
      const deviceCreation = testGenerator.makeDeviceCreation(userCreation);
      unverifiedUserCreation = userCreation.unverifiedDeviceCreation;
      unverifiedDeviceCreation = deviceCreation.unverifiedDeviceCreation;
      user = userCreation.user;
    });

    it('should accept a valid user creation', () => {
      expect(() => verifyDeviceCreation(unverifiedUserCreation, null, trustchainId, trustchainKeys.publicKey))
        .not.to.throw();
    });

    it('should reject an incorrectly signed delegation for a device', () => {
      unverifiedUserCreation.delegation_signature[0] += 1;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedUserCreation, null, trustchainId, trustchainKeys.publicKey),
        'invalid_delegation_signature',
      );
    });

    it('should reject an incorrectly signed user creation', () => {
      unverifiedUserCreation.signature[0] += 1;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedUserCreation, null, trustchainId, trustchainKeys.publicKey),
        'invalid_signature',
      );
    });

    it('should accept a second deviceCreationV3 if all requirements are met', () => {
      expect(() => verifyDeviceCreation(unverifiedDeviceCreation, user, trustchainId, trustchainKeys.publicKey))
        .not.to.throw();
    });

    it('should reject a second device if the parent has a different user_id', () => {
      user.userId = random(tcrypto.HASH_SIZE);
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, trustchainId, trustchainKeys.publicKey),
        'forbidden',
      );
    });

    it('should reject a deviceCreationV3 if the userPublicKey is not the same as its parent one', () => {
      user.userPublicKeys[0] = random(tcrypto.HASH_SIZE);
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, trustchainId, trustchainKeys.publicKey),
        'invalid_public_user_key',
      );
    });

    it('should reject a deviceCreationV3 if it is signed by the trustchain but the user exists', () => {
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedUserCreation, user, trustchainId, trustchainKeys.publicKey),
        'invalid_author',
      );
    });

    it('should reject a first deviceCreationV3 if is not signed by the trustchain', () => {
      unverifiedUserCreation.author = random(tcrypto.HASH_SIZE);
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedUserCreation, null, trustchainId, trustchainKeys.publicKey),
        'invalid_author',
      );
    });

    it('should reject a deviceCreationV3 if last_reset is not null', () => {
      unverifiedDeviceCreation.last_reset = new Uint8Array([1]);
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, trustchainId, trustchainKeys.publicKey),
        'invalid_last_reset',
      );
    });

    it('should reject a deviceCreationV1 if the user_key is not null', () => {
      unverifiedDeviceCreation.nature = NATURE.device_creation_v1;
      assertFailWithNature(
        () => verifyDeviceCreation(unverifiedDeviceCreation, user, trustchainId, trustchainKeys.publicKey),
        'forbidden',
      );
    });

    it('should accept a deviceCreationV1 if all requirements are met', () => {
      unverifiedUserCreation.nature = NATURE.device_creation_v1;
      expect(() => verifyDeviceCreation(unverifiedUserCreation, null, trustchainId, trustchainKeys.publicKey))
        .to.not.throw();
    });

    it('should accept a second deviceCreationV1 if all requirements are met', () => {
      unverifiedDeviceCreation.nature = NATURE.device_creation_v1;
      user.userPublicKeys = [];
      expect(() => verifyDeviceCreation(unverifiedDeviceCreation, user, trustchainId, trustchainKeys.publicKey))
        .to.not.throw();
    });
  });
});
