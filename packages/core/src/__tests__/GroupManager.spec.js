// @flow

import sinon from 'sinon';
import { expect } from '@tanker/chai';

import { tcrypto } from '@tanker/crypto';
import { makeGroupStoreBuilder } from './GroupStoreBuilder';
import GroupManager from '../Groups/Manager';
import { InvalidGroupSize } from '../errors';

class StubTrustchain {
  forceSync = () => null;
  updateGroupStore = () => null;
}

async function makeTestUsers({ onUpdateGroupStore } = {}) {
  const trustchainAPI = new StubTrustchain();

  const { builder, generator, groupStore } = await makeGroupStoreBuilder();

  if (onUpdateGroupStore)
    trustchainAPI.updateGroupStore = onUpdateGroupStore({ builder, generator, groupStore });

  const stubs = {
    forceSync: sinon.stub(trustchainAPI, 'forceSync'),
    updateGroupStore: sinon.stub(trustchainAPI, 'updateGroupStore'),
  };

  // $FlowExpectedError Yeah you bet
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
  it('returns a group', async () => {
    const { groupMan, builder, generator } = await makeTestUsers();
    const alice = await generator.newUserCreationV3('alice');
    const aliceGroup = await builder.newUserGroupCreation(alice.device, ['alice']);
    const groups = await groupMan.findGroups([aliceGroup.groupSignatureKeyPair.publicKey]);

    expect(groups.length).to.equal(1);
    expect(groups[0].publicSignatureKey).to.deep.equal(aliceGroup.groupSignatureKeyPair.publicKey);
  });

  it('does not fetch a fetched group', async () => {
    const { groupMan, builder, generator, stubs } = await makeTestUsers();
    const alice = await generator.newUserCreationV3('alice');
    const aliceGroup = await builder.newUserGroupCreation(alice.device, ['alice']);
    await groupMan.findGroups([aliceGroup.groupSignatureKeyPair.publicKey]);

    expect(stubs.forceSync.notCalled).to.be.true;
    expect(stubs.updateGroupStore.notCalled).to.be.true;
  });

  it('fetches a user if not present in the userStore', async () => {
    const { groupMan, stubs } = await makeTestUsers();
    const groupId = new Uint8Array(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupMan.findGroups([groupId]);

    expect(stubs.forceSync.withArgs([], [groupId]).calledOnce).to.be.true;
    expect(stubs.updateGroupStore.withArgs([groupId]).calledOnce).to.be.true;
  });

  it('returns a fetched user', async () => {
    const { groupMan, builder, generator, stubs } = await makeTestUsers();
    const alice = await generator.newUserCreationV3('alice');
    const aliceGroup = await generator.newUserGroupCreation(alice.device, ['alice']);
    await groupMan.findGroups([aliceGroup.groupSignatureKeyPair.publicKey]);

    stubs.updateGroupStore.callsFake(async () => {
      await builder.applyUserGroupCreation(aliceGroup);
    });

    const groups = await groupMan.findGroups([aliceGroup.groupSignatureKeyPair.publicKey]);

    expect(groups.length).to.equal(1);
    expect(groups[0].publicSignatureKey).to.deep.equal(aliceGroup.groupSignatureKeyPair.publicKey);
  });

  it('throws when creating a group with 0 members', async () => {
    const { groupMan } = await makeTestUsers();
    await expect(groupMan.createGroup([])).to.be.rejectedWith(InvalidGroupSize);
  });

  it('throws when creating a group with 1001 members', async () => {
    const { groupMan } = await makeTestUsers();
    const users = Array.from({ length: 1001 }, () => 'bob');
    await expect(groupMan.createGroup(users)).to.be.rejectedWith(InvalidGroupSize);
  });
});
