// @flow

import { tcrypto, random } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

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

  describe('user devices & revocations', () => {
    let userCreation;
    let deviceCreation;
    let deviceRevocation;
    let userId;

    before(async () => {
      userId = random(tcrypto.HASH_SIZE);
      userCreation = await testGenerator.makeUserCreation(userId);
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
});
