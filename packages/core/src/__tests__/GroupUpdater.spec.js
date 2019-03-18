// @flow

import { mergeSchemas } from '@tanker/datastore-base';
import { createUserSecretBinary } from '@tanker/identity';
import { tcrypto } from '@tanker/crypto';

import { expect } from './chai';
import { type UserGroupAdditionRecord, type UserGroupCreationRecordV2, type UserGroupCreationRecord } from '../Blocks/payloads';
import GroupStore from '../Groups/GroupStore';
import GroupUpdater from '../Groups/GroupUpdater';
import dataStoreConfig, { makePrefix, openDataStore } from './TestDataStore';
import { makeTrustchainBuilder } from './TrustchainBuilder';
import { type UnverifiedUserGroupCreation } from '../UnverifiedStore/UserGroupsUnverifiedStore';

async function makeMemoryGroupStore(): Promise<GroupStore> {
  const schemas = mergeSchemas(GroupStore.schemas);

  const baseConfig = { ...dataStoreConfig, schemas };
  const config = { ...baseConfig, dbName: `group-store-test-${makePrefix()}` };
  const userSecret = createUserSecretBinary('trustchainid', 'userId');
  return GroupStore.open(await openDataStore(config), userSecret);
}

describe('GroupUpdater', () => {
  let builder;
  let groupStore;
  let provisionalUserKeys;
  let publicProvisionalUser;

  beforeEach(async () => {
    builder = await makeTrustchainBuilder();
    groupStore = await makeMemoryGroupStore();

    provisionalUserKeys = {
      appSignatureKeyPair: tcrypto.makeSignKeyPair(),
      appEncryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
      tankerSignatureKeyPair: tcrypto.makeSignKeyPair(),
      tankerEncryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
    };
    publicProvisionalUser = {
      trustchainId: builder.generator.trustchainId,
      target: 'email',
      value: 'bob@mail.com',
      appSignaturePublicKey: provisionalUserKeys.appSignatureKeyPair.publicKey,
      appEncryptionPublicKey: provisionalUserKeys.appEncryptionKeyPair.publicKey,
      tankerSignaturePublicKey: provisionalUserKeys.tankerSignatureKeyPair.publicKey,
      tankerEncryptionPublicKey: provisionalUserKeys.tankerEncryptionKeyPair.publicKey,
    };
  });

  it('handles a group creation I do not belong to', async () => {
    const alice = await builder.addUserV3('alice');
    const bob = await builder.addUserV3('bob');
    const group = await builder.addUserGroupCreation(bob, ['bob']);
    const groupUpdater = new GroupUpdater(groupStore, await builder.getKeystoreOfDevice(alice.user, alice.device));

    const payload: UserGroupCreationRecordV2 = (group.entry.payload_unverified: any);
    const entry: UnverifiedUserGroupCreation = {
      ...group.entry,
      ...payload,
    };

    await groupUpdater.applyEntry(entry);

    expect(await groupStore.findExternal({ groupId: group.groupSignatureKeyPair.publicKey })).to.deep.equal({
      groupId: group.groupSignatureKeyPair.publicKey,
      publicSignatureKey: group.groupSignatureKeyPair.publicKey,
      publicEncryptionKey: group.groupEncryptionKeyPair.publicKey,
      encryptedPrivateSignatureKey: payload.encrypted_group_private_signature_key,
      lastGroupBlock: group.entry.hash,
      index: group.entry.index,
    });
    expect(await groupStore.findFull({ groupId: group.groupSignatureKeyPair.publicKey })).to.deep.equal(null);
  });

  it('handles a group creation I do belong to', async () => {
    const alice = await builder.addUserV3('alice');
    const group = await builder.addUserGroupCreation(alice, ['alice']);
    const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);
    const groupUpdater = new GroupUpdater(groupStore, await builder.getKeystoreOfDevice(alice.user, alice.device));

    await groupUpdater.applyEntry({ ...group.entry, ...payload });

    expect(await groupStore.findFull({ groupId: group.groupSignatureKeyPair.publicKey })).to.deep.equal({
      groupId: group.groupSignatureKeyPair.publicKey,
      signatureKeyPair: group.groupSignatureKeyPair,
      encryptionKeyPair: group.groupEncryptionKeyPair,
      lastGroupBlock: group.entry.hash,
      index: group.entry.index,
    });
  });

  it('handles a group creation I do not belong to as a provisional user', async () => {
    const alice = await builder.addUserV3('alice');
    const group = await builder.addUserGroupCreation(alice, [], [publicProvisionalUser]);
    const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);
    const groupUpdater = new GroupUpdater(groupStore, await builder.getKeystoreOfDevice(alice.user, alice.device));

    await groupUpdater.applyEntry({ ...group.entry, ...payload });

    expect(await groupStore.findFull({ groupId: group.groupSignatureKeyPair.publicKey })).to.deep.equal(null);
  });

  it('handles a group creation I belong to as a provisional user', async () => {
    const alice = await builder.addUserV3('alice');
    const group = await builder.addUserGroupCreation(alice, [], [publicProvisionalUser]);
    const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);
    const groupUpdater = new GroupUpdater(groupStore, await builder.getKeystoreOfDevice(alice.user, alice.device, [provisionalUserKeys]));

    await groupUpdater.applyEntry({ ...group.entry, ...payload });

    expect(await groupStore.findFull({ groupId: group.groupSignatureKeyPair.publicKey })).to.deep.equal({
      groupId: group.groupSignatureKeyPair.publicKey,
      signatureKeyPair: group.groupSignatureKeyPair,
      encryptionKeyPair: group.groupEncryptionKeyPair,
      lastGroupBlock: group.entry.hash,
      index: group.entry.index,
    });
  });

  it('handles a group addition for a group I do not belong to', async () => {
    const alice = await builder.addUserV3('alice');
    const bob = await builder.addUserV3('bob');
    await builder.addUserV3('charlie');
    const group = await builder.addUserGroupCreation(bob, ['bob']);
    const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);

    const groupAdd = await builder.addUserGroupAddition(bob, group, ['charlie']);
    const additionPayload: UserGroupAdditionRecord = (groupAdd.entry.payload_unverified: any);
    const groupUpdater = new GroupUpdater(groupStore, await builder.getKeystoreOfDevice(alice.user, alice.device));

    await groupUpdater.applyEntry({ ...group.entry, ...payload });
    await groupUpdater.applyEntry({ ...groupAdd.entry, ...additionPayload });

    const newGroup = await groupStore.findExternal({ groupId: group.groupSignatureKeyPair.publicKey });
    expect(newGroup.lastGroupBlock).to.deep.equal(groupAdd.entry.hash);
  });

  it('handles a group addition I always belonged to', async () => {
    const alice = await builder.addUserV3('alice');
    await builder.addUserV3('charlie');
    const group = await builder.addUserGroupCreation(alice, ['alice']);
    const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);

    const groupAdd = await builder.addUserGroupAddition(alice, group, ['charlie']);
    const additionPayload: UserGroupAdditionRecord = (groupAdd.entry.payload_unverified: any);
    const groupUpdater = new GroupUpdater(groupStore, await builder.getKeystoreOfDevice(alice.user, alice.device));

    await groupUpdater.applyEntry({ ...group.entry, ...payload });
    await groupUpdater.applyEntry({ ...groupAdd.entry, ...additionPayload });

    const newGroup = await groupStore.findExternal({ groupId: group.groupSignatureKeyPair.publicKey });
    expect(newGroup.lastGroupBlock).to.deep.equal(groupAdd.entry.hash);
  });

  it('handles a group addition which adds me', async () => {
    const alice = await builder.addUserV3('alice');
    const charlie = await builder.addUserV3('charlie');

    const group = await builder.addUserGroupCreation(alice, ['alice']);
    const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);

    const groupAdd = await builder.addUserGroupAddition(alice, group, ['charlie']);
    const additionPayload: UserGroupAdditionRecord = (groupAdd.entry.payload_unverified: any);
    const groupUpdater = new GroupUpdater(groupStore, await builder.getKeystoreOfDevice(charlie.user, charlie.device));

    await groupUpdater.applyEntry({ ...group.entry, ...payload });
    await groupUpdater.applyEntry({ ...groupAdd.entry, ...additionPayload });

    expect(await groupStore.findFull({ groupId: group.groupSignatureKeyPair.publicKey })).to.deep.equal({
      groupId: group.groupSignatureKeyPair.publicKey,
      signatureKeyPair: group.groupSignatureKeyPair,
      encryptionKeyPair: group.groupEncryptionKeyPair,
      lastGroupBlock: groupAdd.entry.hash,
      index: groupAdd.entry.index,
    });
  });
});
