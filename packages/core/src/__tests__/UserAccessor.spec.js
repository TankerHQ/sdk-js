// @flow
import { utils } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import { createIdentity, getPublicIdentity, _deserializePublicIdentity, type PublicPermanentIdentity } from '@tanker/identity';
import { expect, sinon } from '@tanker/test-utils';

import { makeUserStoreBuilder } from './UserStoreBuilder';
import UserAccessor from '../Users/UserAccessor';
import makeUint8Array from './makeUint8Array';

import Trustchain from '../Trustchain/Trustchain';

class StubTrustchain {
  sync = () => null;
  updateUserStore = () => null;
  _trustchainStore = {
    _trustchainId: null,
  };
  verifyDevice = () => null;
}

async function makeTestUsers({ onUpdateUserStore } = {}) {
  const stubTrustchain = new StubTrustchain();
  const me = makeUint8Array('fake author', 32);

  const { builder, generator, userStore } = await makeUserStoreBuilder();
  stubTrustchain._trustchainStore._trustchainId = generator.trustchainId; // eslint-disable-line no-underscore-dangle

  if (onUpdateUserStore)
    stubTrustchain.updateUserStore = onUpdateUserStore({ builder, generator, userStore });

  const stubs = {
    sync: sinon.stub(stubTrustchain, 'sync'),
    updateUserStore: sinon.stub(stubTrustchain, 'updateUserStore'),
  };

  const trustchain: Trustchain = (stubTrustchain: any);
  const users = new UserAccessor(userStore, trustchain, generator.trustchainId, me);
  // add a user just in case... (can catch bugs)
  await builder.newUserCreationV3('germaine');

  return {
    builder,
    generator,
    userStore,
    users,
    stubTrustchain,
    stubs,
  };
}


describe('Users', () => {
  describe('findUser', () => {
    it('returns a user', async () => {
      const { users, builder } = await makeTestUsers();
      const alice = await builder.newUserCreationV3('alice');
      const user = await users.findUser(alice.entry.user_id);

      expect(user && user.userId).to.deep.equal(alice.entry.user_id);
    });

    it('fetches a user', async () => {
      const { users, stubs } = await makeTestUsers();
      const hashedBobId = new Uint8Array(32);

      await users.findUser(hashedBobId);

      expect(stubs.sync.withArgs([hashedBobId]).calledOnce).to.be.true;
      expect(stubs.updateUserStore.withArgs([hashedBobId]).calledOnce).to.be.true;
    });

    it('returns a fetched user', async () => {
      const { users, generator, builder, stubs } = await makeTestUsers();
      const hashedBobId = generator.userId('bob');

      stubs.updateUserStore.callsFake(async () => {
        await builder.newUserCreationV3('bob');
      });

      const user = await users.findUser(hashedBobId);

      expect(user && user.userId).to.deep.equal(hashedBobId);
    });
  });

  describe('findUsers', () => {
    it('fetches users', async () => {
      const { users, stubs, generator, builder } = await makeTestUsers();
      const hashedBobId = generator.userId('bob');
      const hashedAliceId = generator.userId('alice');
      const merlin = await builder.newUserCreationV3('merlin');

      await users.findUsers({ hashedUserIds: [merlin.entry.user_id, hashedBobId, hashedAliceId] });

      expect(stubs.sync.withArgs([merlin.entry.user_id, hashedBobId, hashedAliceId]).calledOnce).to.be.true;
      expect(stubs.updateUserStore.withArgs([merlin.entry.user_id, hashedBobId, hashedAliceId]).calledOnce).to.be.true;
    });

    it('returns users', async () => {
      const { users, builder } = await makeTestUsers();
      const alice = await builder.newUserCreationV3('alice');
      const bob = await builder.newUserCreationV3('bob');

      const hashedUserIds = [alice.entry.user_id, bob.entry.user_id];
      const retUsers = await users.findUsers({ hashedUserIds });
      const retUserIds = retUsers.map(u => utils.toBase64(u.userId));
      const expectedUserIds = hashedUserIds.map(id => utils.toBase64(id));
      expect(retUserIds).to.have.members(expectedUserIds);
    });

    it('returns all users including fetched ones', async () => {
      const { users, stubs, generator, builder } = await makeTestUsers();
      const hashedBobId = generator.userId('bob');
      const hashedAliceId = generator.userId('alice');
      const merlin = await builder.newUserCreationV3('charlie');
      const merlette = await builder.newUserCreationV3('john');

      stubs.updateUserStore.callsFake(async () => {
        await builder.newUserCreationV3('bob');
        await builder.newUserCreationV3('alice');
      });

      const hashedUserIds = [merlin.entry.user_id, merlette.entry.user_id, hashedBobId, hashedAliceId];
      const retUsers = await users.findUsers({ hashedUserIds });
      const retUserIds = retUsers.map(u => utils.toBase64(u.userId));
      const expectedUserIds = hashedUserIds.map(id => utils.toBase64(id));
      expect(retUserIds).to.have.members(expectedUserIds);
    });
  });

  describe('getUsers', () => {
    const toPublicIdentity = async (identity): Promise<PublicPermanentIdentity> => {
      const publicIdentity = await getPublicIdentity(identity);
      return (_deserializePublicIdentity(publicIdentity): any);
    };
    const toPublicIdentities = (list): Promise<Array<PublicPermanentIdentity>> => Promise.all(list.map(toPublicIdentity));

    it('returns users', async () => {
      const { users, builder, generator } = await makeTestUsers();
      const alice = await builder.newUserCreationV3('alice');
      const bob = await builder.newUserCreationV3('bob');
      const aliceIdentity = await createIdentity(utils.toBase64(generator.trustchainId), utils.toBase64(generator.appSignKeys.privateKey), 'alice');
      const bobIdentity = await createIdentity(utils.toBase64(generator.trustchainId), utils.toBase64(generator.appSignKeys.privateKey), 'bob');

      const publicIdentities = await toPublicIdentities([aliceIdentity, bobIdentity]);
      const retUsers = await users.getUsers({ publicIdentities });
      const retUserIds = retUsers.map(u => utils.toBase64(u.userId));
      const expectedUserIds = [alice, bob].map(u => utils.toBase64(u.entry.user_id));
      expect(retUserIds).to.have.members(expectedUserIds);
    });

    it('throws InvalidArgument as appropriate', async () => {
      const { users, builder, generator } = await makeTestUsers();
      await builder.newUserCreationV3('alice');
      await builder.newUserCreationV3('bob');
      const aliceIdentity = await createIdentity(utils.toBase64(generator.trustchainId), utils.toBase64(generator.appSignKeys.privateKey), 'alice');
      const bobIdentity = await createIdentity(utils.toBase64(generator.trustchainId), utils.toBase64(generator.appSignKeys.privateKey), 'bob');

      const casperUnregisteredIdentity = await createIdentity(utils.toBase64(generator.trustchainId), utils.toBase64(generator.appSignKeys.privateKey), 'casper');

      const publicIdentities = await toPublicIdentities([aliceIdentity, bobIdentity, casperUnregisteredIdentity]);
      await expect(users.getUsers({ publicIdentities })).to.be.rejectedWith(InvalidArgument);
    });
  });
});
