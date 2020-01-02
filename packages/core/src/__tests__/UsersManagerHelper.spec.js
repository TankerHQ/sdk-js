// @flow
import { tcrypto, random, utils } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { usersFromBlocks } from '../Users/ManagerHelper';


import TestGenerator from './TestGenerator';

describe('UserManagerHelper', () => {
  describe('usersFromBlocks()', () => {
    it('can inflate multiple users from different blocks', async () => {
      const userId = random(tcrypto.HASH_SIZE);
      const userId2 = random(tcrypto.HASH_SIZE);

      const testGenerator = new TestGenerator();
      const trustchainCreation = testGenerator.makeTrustchainCreation();

      const userCreation = await testGenerator.makeUserCreation(userId);
      const deviceCreation = await testGenerator.makeDeviceCreation(userCreation);
      const deviceCreation2 = await testGenerator.makeDeviceCreation(deviceCreation);
      const deviceRevocation = await testGenerator.makeDeviceRevocation(deviceCreation2, deviceCreation2.testDevice.id);

      const userCreation2 = await testGenerator.makeUserCreation(userId2);
      const deviceCreationUser2 = await testGenerator.makeDeviceCreation(userCreation2);

      const blocks = [userCreation.block, userCreation2.block, deviceCreation.block, deviceCreationUser2.block, deviceCreation2.block, deviceRevocation.block];

      const { userIdToUserMap, deviceIdToUserIdMap } = await usersFromBlocks(blocks, trustchainCreation.trustchainKeys.publicKey);

      expect(userIdToUserMap.size).to.deep.equal(2);
      expect(deviceIdToUserIdMap.size).to.deep.equal(5); // revoked device still is a device
      const b64UserId = utils.toBase64(userCreation.user.userId);
      const b64UserId2 = utils.toBase64(userCreation2.user.userId);

      expect(userIdToUserMap.get(b64UserId)).to.deep.equal(deviceRevocation.user);
      expect(userIdToUserMap.get(b64UserId2)).to.deep.equal(deviceCreationUser2.user);

      expect(deviceIdToUserIdMap.get(utils.toBase64(userCreation.testDevice.id))).to.deep.equal(b64UserId);
      expect(deviceIdToUserIdMap.get(utils.toBase64(deviceCreation.testDevice.id))).to.deep.equal(b64UserId);
      expect(deviceIdToUserIdMap.get(utils.toBase64(deviceCreation2.testDevice.id))).to.deep.equal(b64UserId);

      expect(deviceIdToUserIdMap.get(utils.toBase64(userCreation2.testDevice.id))).to.deep.equal(b64UserId2);
      expect(deviceIdToUserIdMap.get(utils.toBase64(deviceCreationUser2.testDevice.id))).to.deep.equal(b64UserId2);
    });
  });
});
