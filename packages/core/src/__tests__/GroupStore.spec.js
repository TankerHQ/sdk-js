// @flow

import { tcrypto, random } from '@tanker/crypto';
import { mergeSchemas } from '@tanker/datastore-base';
import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import GroupStore from '../Groups/GroupStore';

import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';
import TestGenerator, { type TestUserGroup, type TestDeviceCreation } from './TestGenerator';

import makeUint8Array from './makeUint8Array';

export async function makeMemoryGroupStore() {
  const schemas = mergeSchemas(GroupStore.schemas);
  const userSecret = createUserSecretBinary('trustchainid', 'Merkle–Damgård');

  const baseConfig = { ...dataStoreConfig, schemas };
  const config = { ...baseConfig, dbName: `group-store-test-${makePrefix()}` };
  const dataStore = await openDataStore(config);
  const groupStore = await GroupStore.open(dataStore, userSecret);
  return groupStore;
}

describe('GroupStore', () => {
  let groupStore;
  let testGenerator;

  let groupId: Uint8Array;
  let testUserCreation: TestDeviceCreation;
  let testGroup: TestUserGroup;

  before(async () => {
    testGenerator = new TestGenerator();
    testGenerator.makeTrustchainCreation();
    groupStore = await makeMemoryGroupStore();
  });

  beforeEach(async () => {
    testUserCreation = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
    testGroup = testGenerator.makeUserGroupCreation(testUserCreation, [testUserCreation.user]);
    groupId = testGroup.group.groupId;
  });

  it('can add a full group', async () => {
    await expect(groupStore.put(testGroup.group)).to.be.fulfilled;
    expect(await groupStore.findFull({ groupId })).to.deep.equal(testGroup.group);
  });

  it('can add a full group and get an external group', async () => {
    await expect(groupStore.put(testGroup.group)).to.be.fulfilled;
    expect(await groupStore.findExternal({ groupId })).excluding(['encryptedPrivateSignatureKey']).to.deep.equal(testGroup.externalGroup);
  });

  it('can add an external group', async () => {
    await groupStore.putExternal(testGroup.externalGroup);
    expect(await groupStore.findExternal({ groupId })).to.deep.equal(testGroup.externalGroup);
  });

  it('cannot find a group that was not added', async () => {
    expect(await groupStore.findFull({ groupId: new Uint8Array(10) })).to.equal(null);
    expect(await groupStore.findExternal({ groupId: new Uint8Array(10) })).to.equal(null);
  });

  it('cannot find a full group if we only have an external group', async () => {
    await groupStore.putExternal(testGroup.externalGroup);
    expect(await groupStore.findFull({ groupId })).to.equal(null);
  });

  it('can find a group by public encryption key', async () => {
    await groupStore.put(testGroup.group);
    expect(await groupStore.findFull({ groupPublicEncryptionKey: testGroup.group.encryptionKeyPair.publicKey })).to.deep.equal(testGroup.group);
  });

  it('cannot find an external group by public encryption key', async () => {
    await groupStore.putExternal(testGroup.externalGroup);
    expect(await groupStore.findFull({ groupPublicEncryptionKey: testGroup.group.encryptionKeyPair.publicKey })).to.deep.equal(null);
  });

  it('can extend a group from external to normal', async () => {
    await groupStore.putExternal(testGroup.externalGroup);
    await groupStore.put(testGroup.group);

    expect(await groupStore.findFull({ groupId })).to.deep.equal(testGroup.group);
  });

  it('can override groups', async () => {
    const testGroup2 = testGenerator.makeUserGroupAddition(testUserCreation, testGroup, []);
    await groupStore.put(testGroup.group);
    await groupStore.put(testGroup2.group);

    expect(await groupStore.findFull({ groupId })).to.deep.equal(testGroup2.group);
  });

  it('can update the last group block of an external group', async () => {
    await groupStore.putExternal(testGroup.externalGroup);

    const newBlockHash = makeUint8Array('new hash', tcrypto.HASH_SIZE);
    const newBlockIndex = 1337;
    await groupStore.updateLastGroupBlock({ groupId, currentLastGroupBlock: newBlockHash, currentLastGroupIndex: newBlockIndex });

    const got = await groupStore.findExternal({ groupId });
    expect(got.lastGroupBlock).to.deep.equal(newBlockHash);
    expect(got.index).to.deep.equal(newBlockIndex);
  });

  it('can update the last group block of a full group', async () => {
    await groupStore.put(testGroup.group);

    const newBlockHash = makeUint8Array('new hash', tcrypto.HASH_SIZE);
    const newBlockIndex = 1337;
    await expect(groupStore.updateLastGroupBlock({ groupId, currentLastGroupBlock: newBlockHash, currentLastGroupIndex: newBlockIndex })).to.be.fulfilled;

    const got = await groupStore.findFull({ groupId });
    expect(got.lastGroupBlock).to.deep.equal(newBlockHash);
    expect(got.index).to.deep.equal(newBlockIndex);
  });

  it('cannot find a group by unknown provisional public signature keys', async () => {
    const got = await groupStore.findExternalsByProvisionalSignaturePublicKeys({
      appPublicSignatureKey: random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
      tankerPublicSignatureKey: random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
    });
    expect(got).to.have.lengthOf(0);
  });

  it('can find a group by provisional public signature keys', async () => {
    const provisionalUser = testGenerator.makeProvisionalUser();
    const groupWithProvisional = testGenerator.makeUserGroupCreation(testUserCreation, [], [provisionalUser]);
    await groupStore.putExternal(groupWithProvisional.externalGroup);

    const got = await groupStore.findExternalsByProvisionalSignaturePublicKeys({
      appPublicSignatureKey: provisionalUser.appSignaturePublicKey,
      tankerPublicSignatureKey: provisionalUser.tankerSignaturePublicKey,
    });
    expect(got).to.deep.equal([groupWithProvisional.externalGroup]);
  });
});
