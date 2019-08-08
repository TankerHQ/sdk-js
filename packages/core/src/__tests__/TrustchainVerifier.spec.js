// @flow
/* eslint-disable no-underscore-dangle */

import { expect, assert } from './chai';
import { InvalidBlockError } from '../errors.internal';
import { deviceCreationFromBlock } from '../Blocks/entries';
import { makeTrustchainBuilder } from './TrustchainBuilder';

async function assertFailsWithNature(promise: Promise<*>, nature: string): Promise<void> {
  try {
    await promise;
  } catch (e) {
    expect(e).to.be.an.instanceOf(InvalidBlockError);
    expect(e.nature).to.deep.equal(nature);
    return;
  }
  assert.fail('Exception not thrown');
}

describe('TrustchainVerifier', function () { // eslint-disable-line func-names
  // Running with PouchDB memory in the browser is very slow
  this.timeout(30000);

  describe('block validation', () => {
    it('should reject a block with an unknown author', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      await generator.newUserCreationV3('alice');
      const alice = await generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });
      await builder.unverifiedStore.addUnverifiedUserEntries([deviceCreationFromBlock(alice.block)]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice.unverifiedDeviceCreation), 'unknown_author');
    });
  });

  describe('verifyUser', () => {
    it('only marks all the necessary entries of a user as verified', async () => {
      const builder = await makeTrustchainBuilder();
      const { trustchainVerifier, userStore } = builder;
      const alice0 = await builder.addUserV3('alice');
      const alice1 = await builder.addDeviceV3({ id: 'alice', parentIndex: 0 });
      const alice2 = await builder.addDeviceV3({ id: 'alice', parentIndex: 0 });
      const alice3 = await builder.addDeviceV3({ id: 'alice', parentIndex: 1 });
      const alice4 = await builder.addDeviceV3({ id: 'alice', parentIndex: 3 });
      const alice5 = await builder.addDeviceV3({ id: 'alice', parentIndex: 3 });
      const alice6 = await builder.addDeviceV3({ id: 'alice', parentIndex: 5 });
      const bob = await builder.addUserV3('bob');

      const userId = alice0.entry.user_id;
      if (!userId)
        throw new Error('invalid user id');
      await trustchainVerifier.verifyDeviceCreation(alice4.unverifiedDeviceCreation);

      // We verified 4, so all previous devices should be verified too (but no more)

      expect(await userStore.findDevice({ deviceId: alice0.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: alice1.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: alice2.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: alice3.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: alice4.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: alice5.entry.hash })).to.be.null;
      expect(await userStore.findDevice({ deviceId: alice6.entry.hash })).to.be.null;

      expect(await userStore.findDevice({ deviceId: bob.entry.hash })).to.be.null;
    });
  });
});
