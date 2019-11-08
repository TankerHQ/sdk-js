// @flow
/* eslint-disable no-underscore-dangle */

import { expect } from '@tanker/test-utils';
import { makeTrustchainBuilder } from './TrustchainBuilder';

describe('TrustchainVerifier', function () { // eslint-disable-line func-names
  // Running with PouchDB memory in the browser is very slow
  this.timeout(30000);

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
