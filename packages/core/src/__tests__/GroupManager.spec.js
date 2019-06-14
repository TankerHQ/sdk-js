// @flow

import sinon from 'sinon';

import { tcrypto, utils, random } from '@tanker/crypto';
import { expect } from './chai';
import GroupManager, { MAX_GROUP_SIZE } from '../Groups/Manager';
import { InvalidArgument, GroupTooBig } from '../errors';

import { makeMemoryGroupStore } from './GroupStore.spec';
import TestGenerator, { type TestUserGroup, type TestDeviceCreation } from './TestGenerator';

describe('GroupManager', () => {
  let groupManager;
  let groupStore;
  let stubTrustchain;

  let testGenerator;

  let groupId: Uint8Array;
  let testUserCreation: TestDeviceCreation;
  let testGroup: TestUserGroup;

  before(async () => {
    stubTrustchain = { sync: sinon.spy(), updateGroupStore: sinon.spy() };
    groupStore = await makeMemoryGroupStore();
    // $FlowExpectedError
    groupManager = new GroupManager(null, stubTrustchain, groupStore, null, null, null);

    testGenerator = new TestGenerator();
    testGenerator.makeTrustchainCreation();
  });

  beforeEach(async () => {
    testUserCreation = await testGenerator.makeUserCreation(random(tcrypto.HASH_SIZE));
    testGroup = testGenerator.makeUserGroupCreation(testUserCreation, [testUserCreation.user]);
    await groupStore.put(testGroup.group);
    groupId = testGroup.group.groupId;
  });

  afterEach(async () => {
    Object.keys(stubTrustchain).forEach(method => {
      stubTrustchain[method].resetHistory();
    });
  });

  it('returns a group', async () => {
    const groups = await groupManager.getGroups([groupId]);

    expect(groups.length).to.equal(1);
    expect(groups[0]).excluding(['encryptedPrivateSignatureKey']).to.deep.equal(testGroup.externalGroup);
  });

  it('does not fetch a fetched group', async () => {
    await groupManager.getGroups([groupId]);

    expect(stubTrustchain.sync.notCalled).to.be.true;
    expect(stubTrustchain.updateGroupStore.notCalled).to.be.true;
  });

  it('fetches a group if not present in the groupStore', async () => {
    const badGroupId = new Uint8Array(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupManager.getGroups([badGroupId]).catch(() => null);

    expect(stubTrustchain.sync.withArgs([], [badGroupId]).calledOnce).to.be.true;
    expect(stubTrustchain.updateGroupStore.withArgs([badGroupId]).calledOnce).to.be.true;
  });

  it('throws when getting a group that does not exist', async () => {
    await expect(groupManager.getGroups([new Uint8Array(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)])).to.be.rejectedWith(InvalidArgument);
  });

  it('throws when updating a non existent group', async () => {
    const fakeGroupId = utils.toBase64(new Uint8Array(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE));
    await expect(groupManager.updateGroupMembers(fakeGroupId, [testUserCreation.testUser.publicIdentity])).to.be.rejectedWith(InvalidArgument);
  });

  it('throws when creating a group with 0 members', async () => {
    await expect(groupManager.createGroup([])).to.be.rejectedWith(InvalidArgument);
  });

  it('throws when updating a group with 0 members', async () => {
    await expect(groupManager.updateGroupMembers(utils.toBase64(groupId), [])).to.be.rejectedWith(InvalidArgument);
  });

  it('throws when creating a group with 1001 members', async () => {
    const users = Array.from({ length: MAX_GROUP_SIZE + 1 }, () => 'bob');
    await expect(groupManager.createGroup(users)).to.be.rejectedWith(GroupTooBig);
  });

  it('throws when updating a group with 1001 members', async () => {
    const users = Array.from({ length: MAX_GROUP_SIZE + 1 }, () => 'bob');
    await expect(groupManager.updateGroupMembers(utils.toBase64(groupId), users)).to.be.rejectedWith(GroupTooBig);
  });
});
