// @flow

import sinon from 'sinon';

import { tcrypto, utils } from '@tanker/crypto';
import { createIdentity, getPublicIdentity } from '@tanker/identity';
import { expect } from './chai';
import { makeGroupStoreBuilder } from './GroupStoreBuilder';
import GroupManager, { MAX_GROUP_SIZE } from '../Groups/Manager';
import { InvalidGroupSize, InvalidArgument } from '../errors';

class StubTrustchain {
  sync = () => null;
  updateGroupStore = () => null;
}

async function makeTestUsers({ onUpdateGroupStore } = {}) {
  const trustchainAPI = new StubTrustchain();

  const { builder, generator, groupStore } = await makeGroupStoreBuilder();

  if (onUpdateGroupStore)
    trustchainAPI.updateGroupStore = onUpdateGroupStore({ builder, generator, groupStore });

  const stubs = {
    sync: sinon.stub(trustchainAPI, 'sync'),
    updateGroupStore: sinon.stub(trustchainAPI, 'updateGroupStore'),
  };

  // $FlowExpectedError
  const groupMan = new GroupManager(null, trustchainAPI, groupStore, null, null, null);
  // add a user just in case... (can catch bugs)
  await generator.newUserCreationV3('germaine');

  return {
    builder,
    generator,
    groupStore,
    groupMan,
    trustchainAPI,
    stubs,
  };
}

describe('GroupManager', () => {
  let groupMan;
  let builder;
  let generator;
  let stubs;
  let alice;
  let aliceGroup;
  let aliceGroupId;

  beforeEach(async () => {
    ({ groupMan, builder, generator, stubs } = await makeTestUsers());
    alice = await generator.newUserCreationV3('alice');
    aliceGroup = await builder.newUserGroupCreation(alice.device, ['alice']);
    aliceGroupId = utils.toBase64(aliceGroup.groupSignatureKeyPair.publicKey);
  });

  it('returns a group', async () => {
    const groups = await groupMan.findGroups([aliceGroup.groupSignatureKeyPair.publicKey]);

    expect(groups.length).to.equal(1);
    expect(groups[0].publicSignatureKey).to.deep.equal(aliceGroup.groupSignatureKeyPair.publicKey);
  });

  it('does not fetch a fetched group', async () => {
    await groupMan.findGroups([aliceGroup.groupSignatureKeyPair.publicKey]);

    expect(stubs.sync.notCalled).to.be.true;
    expect(stubs.updateGroupStore.notCalled).to.be.true;
  });

  it('fetches a user if not present in the userStore', async () => {
    const groupId = new Uint8Array(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupMan.findGroups([groupId]);

    expect(stubs.sync.withArgs([], [groupId]).calledOnce).to.be.true;
    expect(stubs.updateGroupStore.withArgs([groupId]).calledOnce).to.be.true;
  });

  it('returns a fetched user', async () => {
    await groupMan.findGroups([aliceGroup.groupSignatureKeyPair.publicKey]);

    stubs.updateGroupStore.callsFake(async () => {
      await builder.applyUserGroupCreation(aliceGroup);
    });

    const groups = await groupMan.findGroups([aliceGroup.groupSignatureKeyPair.publicKey]);

    expect(groups.length).to.equal(1);
    expect(groups[0].publicSignatureKey).to.deep.equal(aliceGroup.groupSignatureKeyPair.publicKey);
  });

  it('throws when creating a group with 0 members', async () => {
    await expect(groupMan.createGroup([])).to.be.rejectedWith(InvalidGroupSize);
  });

  it('throws when updating a group with 0 members', async () => {
    await expect(groupMan.updateGroupMembers(aliceGroupId, [])).to.be.rejectedWith(InvalidGroupSize);
  });

  it('throws when creating a group with 1001 members', async () => {
    const users = Array.from({ length: MAX_GROUP_SIZE + 1 }, () => 'bob');
    await expect(groupMan.createGroup(users)).to.be.rejectedWith(InvalidGroupSize);
  });

  it('throws when updating a group with 1001 members', async () => {
    const users = Array.from({ length: MAX_GROUP_SIZE + 1 }, () => 'bob');
    await expect(groupMan.updateGroupMembers(aliceGroupId, users)).to.be.rejectedWith(InvalidGroupSize);
  });

  it('throws when updating a non existent group', async () => {
    const fakeGroupId = utils.toBase64(new Uint8Array(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE));
    const users = [await getPublicIdentity(await createIdentity(utils.toBase64(generator.trustchainId), utils.toBase64(generator.appSignKeys.privateKey), 'alice'))];
    await expect(groupMan.updateGroupMembers(fakeGroupId, users)).to.be.rejectedWith(InvalidArgument);
  });
});
