// @flow

import { tcrypto, random } from '@tanker/crypto';

import { expect } from './chai';
import UnverifiedStore from '../Trustchain/UnverifiedStore/UnverifiedStore';
import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';
import TestGenerator from './TestGenerator';

async function initUnverifiedStore(): Promise<UnverifiedStore> {
  const { schemas } = UnverifiedStore;
  const dbName = `unverified-store-test-${makePrefix()}`;
  const datastore = await openDataStore({ ...dataStoreConfig, dbName, schemas });
  return UnverifiedStore.open(datastore);
}

describe('UnverifiedStore', () => {
  let unverifiedStore;
  let testGenerator;

  before(async () => {
    testGenerator = new TestGenerator();
    testGenerator.makeTrustchainCreation();

    unverifiedStore = await initUnverifiedStore();
  });

  describe('key publishes', () => {
    let keyPublish;

    before(async () => {
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      keyPublish = testGenerator.makeKeyPublishToUser(userCreation, userCreation.user);

      await unverifiedStore.addUnverifiedKeyPublishes([keyPublish.unverifiedKeyPublish]);
    });

    it('returns null when fetching a missing key publish', async () => {
      const result = await unverifiedStore.findUnverifiedKeyPublish(new Uint8Array(0));
      expect(result).to.equal(null);
    });

    it('finds an unverified key publish', async () => {
      const result = await unverifiedStore.findUnverifiedKeyPublish(keyPublish.resourceId);
      expect(result).excluding('_rev', '_idx').to.deep.equal(keyPublish.unverifiedKeyPublish);
    });
  });

  describe('user devices & revocations', () => {
    let userCreation;
    let deviceCreation;
    let deviceRevocation;
    let userId;

    before(async () => {
      userId = random(tcrypto.HASH_SIZE);
      userCreation = testGenerator.makeUserCreation(userId);
      deviceCreation = testGenerator.makeDeviceCreation(userCreation);
      deviceRevocation = testGenerator.makeDeviceRevocation(deviceCreation, deviceCreation.testDevice.id);

      await unverifiedStore.addUnverifiedUserEntries([userCreation.unverifiedDeviceCreation, deviceCreation.unverifiedDeviceCreation, deviceRevocation.unverifiedDeviceRevocation]);
    });

    it('returns an empty array when fetching a missing user device', async () => {
      const result = await unverifiedStore.findUnverifiedDevicesByHash([new Uint8Array(0)]);
      expect(result).to.deep.equal([]);
    });

    it('finds an unverified user device', async () => {
      const result = await unverifiedStore.findUnverifiedDevicesByHash([deviceCreation.testDevice.id]);
      expect(result).excluding(['_rev', '_id']).to.deep.equal([deviceCreation.unverifiedDeviceCreation]);
    });

    it('finds an unverified device revocation by hash', async () => {
      const result = await unverifiedStore.findUnverifiedDeviceRevocationByHash(deviceRevocation.unverifiedDeviceRevocation.hash);
      expect(result).excluding(['_rev', '_id']).to.deep.equal(deviceRevocation.unverifiedDeviceRevocation);
    });

    it('finds all entries for a user', async () => {
      const result = await unverifiedStore.findUnverifiedUserEntries([userId]);
      expect(result).excluding(['_rev', '_id']).to.deep.equal([userCreation.unverifiedDeviceCreation, deviceCreation.unverifiedDeviceCreation, deviceRevocation.unverifiedDeviceRevocation]);
    });

    it('finds user entries before index', async () => {
      const result = await unverifiedStore.findUnverifiedUserEntries([userId], deviceRevocation.block.index);
      expect(result).excluding(['_rev', '_id']).to.deep.equal([userCreation.unverifiedDeviceCreation, deviceCreation.unverifiedDeviceCreation]);
    });

    it('can remove an entry (and not find it again)', async () => {
      await unverifiedStore.removeVerifiedUserEntries([deviceCreation.unverifiedDeviceCreation, deviceRevocation.unverifiedDeviceRevocation]);
      const result = await unverifiedStore.findUnverifiedUserEntries([userId]);
      expect(result).excluding(['_rev', '_id']).to.deep.equal([userCreation.unverifiedDeviceCreation]);
    });

    it('can find the userId associated with any device', async () => {
      let result = await unverifiedStore.getUserIdFromDeviceId(userCreation.testDevice.id);
      expect(result).to.deep.equal(userCreation.testUser.id);
      result = await unverifiedStore.getUserIdFromDeviceId(deviceCreation.testDevice.id);
      expect(result).to.deep.equal(userCreation.testUser.id);
    });

    it('returns null if requesting unknown device', async () => {
      const result = await unverifiedStore.getUserIdFromDeviceId(new Uint8Array(0));
      expect(result).to.be.null;
    });
  });

  describe('user groups ', () => {
    let userGroupCreation;
    let userGroupAddition;

    beforeEach(async () => {
      testGenerator.makeTrustchainCreation();
      const userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      userGroupCreation = testGenerator.makeUserGroupCreation(userCreation, [userCreation.user]);

      // Second user
      const userId2 = random(tcrypto.HASH_SIZE);
      const userCreation2 = testGenerator.makeUserCreation(userId2);
      userGroupAddition = testGenerator.makeUserGroupAddition(userCreation, userGroupCreation, [userCreation2.user]);

      await unverifiedStore.addUnverifiedUserGroups([userGroupCreation.unverifiedUserGroup, userGroupAddition.unverifiedUserGroup]);
    });

    it('returns empty array when fetching a missing user group', async () => {
      const result = await unverifiedStore.findUnverifiedUserGroup(new Uint8Array(0));
      expect(result).to.deep.equal([]);
    });

    it('returns empty array when fetching a missing user group', async () => {
      const result = await unverifiedStore.findUnverifiedUserGroupByPublicEncryptionKey(new Uint8Array(0));
      expect(result).to.deep.equal([]);
    });

    it('finds an unverified user group ', async () => {
      const result = await unverifiedStore.findUnverifiedUserGroup(userGroupCreation.externalGroup.groupId);
      expect(result).excluding(['_rev', '_id']).to.deep.equal([userGroupCreation.unverifiedUserGroup, userGroupAddition.unverifiedUserGroup]);
    });

    it('finds an unverified user group by encryption key', async () => {
      const result = await unverifiedStore.findUnverifiedUserGroupByPublicEncryptionKey(userGroupCreation.externalGroup.publicEncryptionKey);
      expect(result).excluding(['_rev', '_id']).to.deep.equal([userGroupCreation.unverifiedUserGroup, userGroupAddition.unverifiedUserGroup]);
    });

    it('deletes a verified user group creation', async () => {
      await unverifiedStore.removeVerifiedUserGroupEntry(userGroupCreation.unverifiedUserGroup);
      const result = await unverifiedStore.findUnverifiedUserGroup(userGroupCreation.externalGroup.groupId);
      expect(result).excluding(['_rev', '_id']).to.deep.equal([userGroupAddition.unverifiedUserGroup]);
    });

    it('deletes a verified user group addition', async () => {
      await unverifiedStore.removeVerifiedUserGroupEntry((userGroupAddition.unverifiedUserGroup));
      const result = await unverifiedStore.findUnverifiedUserGroup(userGroupCreation.externalGroup.groupId);
      expect(result).excluding(['_rev', '_id']).to.deep.equal([userGroupCreation.unverifiedUserGroup]);
    });
  });

  describe('claim provisional identity', () => {
    let claim;
    let userId;

    before(async () => {
      userId = random(tcrypto.HASH_SIZE);
      const userCreation = testGenerator.makeUserCreation(userId);
      claim = testGenerator.makeProvisionalIdentityClaim(userCreation, userId, random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE));

      await unverifiedStore.addUnverifiedProvisionalIdentityClaimEntries([claim.unverifiedProvisionalIdentityClaim]);
    });

    it('returns null when fetching a missing claim provisional identity', async () => {
      const result = await unverifiedStore.findUnverifiedProvisionalIdentityClaims(new Uint8Array(0));
      expect(result.length).to.equal(0);
    });

    it('finds a claim provisional identity', async () => {
      const result = await unverifiedStore.findUnverifiedProvisionalIdentityClaims(userId);
      expect(result.length).to.equal(1);
      expect(result[0]).excluding('_rev').to.deep.equal(claim.unverifiedProvisionalIdentityClaim);
    });

    it('removes a claim provisional identity', async () => {
      await unverifiedStore.removeVerifiedProvisionalIdentityClaimEntries([claim.unverifiedProvisionalIdentityClaim]);
      const result = await unverifiedStore.findUnverifiedProvisionalIdentityClaims(userId);
      expect(result.length).to.equal(0);
    });
  });
});
