// @flow

import { tcrypto } from '@tanker/crypto';
import { expect } from './chai';
import TrustchainBuilder, { makeTrustchainBuilder } from './TrustchainBuilder';
import { type GeneratorUserResult } from './Generator';
import { setKeyPublishAuthor, setRecipientKeyPublish } from './Trustchain.verify.spec';
import UserStore from '../Users/UserStore';
import { NATURE } from '../Blocks/payloads';


describe('TrustchainVerifierCore', () => {
  describe('verifyRootBlock', () => {
    it('marks the block as verified', async () => {
      const { generator, trustchainStore, trustchainVerifier } = await makeTrustchainBuilder();
      const rootEntry = generator.root.entry;
      await trustchainStore.addTrustchainCreation(rootEntry);
      // const entry = await trustchainStore.getMaybeVerifiedEntryByHash(rootEntry.hash);

      await trustchainVerifier.verifyTrustchainCreation(rootEntry);

      const isVerified = await trustchainStore.isVerified(rootEntry.hash);
      expect(isVerified).to.be.true;
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

      expect(await userStore.findDevice({ hashedDeviceId: alice0.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: alice1.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: alice2.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: alice3.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: alice4.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: alice5.entry.hash })).to.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: alice6.entry.hash })).to.be.null;

      expect(await userStore.findDevice({ hashedDeviceId: bob.entry.hash })).to.be.null;
    });
  });

  describe('verifyKeyPublishes', () => {
    let builder: TrustchainBuilder;
    let userStore: UserStore;
    let author: GeneratorUserResult;
    let authorDevice: GeneratorUserResult;
    let author2: GeneratorUserResult;
    let user: GeneratorUserResult;

    beforeEach(async () => {
      builder = await makeTrustchainBuilder();
      ({ userStore } = builder);
      user = await builder.addUserV3('alice');
      authorDevice = await builder.addUserV3('bob');
      author = await builder.addDeviceV3({ id: 'bob', parentIndex: 0 });
      author2 = await builder.addUserV3('dave');

      await builder.trustchainVerifier.verifyDeviceCreation(user.unverifiedDeviceCreation);
    });

    it('verifies all author blocks', async () => {
      const keyPublish = await builder.addKeyPublishToUser({ from: author, to: user });
      const keyPublish2 = await builder.addKeyPublishToUser({ from: author2, to: user });
      const result = await builder.trustchainVerifier.verifyKeyPublishes([keyPublish.unverifiedKeyPublish, keyPublish2.unverifiedKeyPublish]);
      expect(result.length).to.equal(2);
      expect(await userStore.findDevice({ hashedDeviceId: author.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: authorDevice.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: author2.entry.hash })).to.not.be.null;
    });

    it('fails to verify keypublishes with bad authors', async () => {
      const keyPublish = await builder.addKeyPublishToUser({ from: author, to: user });
      const keyPublish2 = await builder.addKeyPublishToUser({ from: author2, to: user });
      const alteredKP2 = setKeyPublishAuthor(keyPublish2, keyPublish.entry.hash);

      const result = await builder.trustchainVerifier.verifyKeyPublishes([keyPublish.unverifiedKeyPublish, alteredKP2.unverifiedKeyPublish]);
      expect(result.length).to.equal(1);
      expect(await userStore.findDevice({ hashedDeviceId: author.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: authorDevice.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: author2.entry.hash })).to.be.null;
    });

    it('verified group block', async () => {
      const group = await builder.addUserGroupCreation(author, ['alice']);

      const keyPublishToGroup = await builder.addKeyPublishToUserGroup({ from: author2, to: group });

      const result = await builder.trustchainVerifier.verifyKeyPublishes([keyPublishToGroup.unverifiedKeyPublish]);
      expect(result.length).to.equal(1);
      expect(await userStore.findDevice({ hashedDeviceId: author.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: authorDevice.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ hashedDeviceId: author2.entry.hash })).to.not.be.null;

      const groupId = (group.entry.payload_unverified: any).public_signature_key;
      const verifiedGroup = await builder.groupStore.findExternal({ groupId });
      expect(!!verifiedGroup).to.be.true;
    });

    it('fails to verify key publishes with bad groups', async () => {
      const group = await builder.addUserGroupCreation(author, ['alice']);

      const keyPublishToGroup = await builder.addKeyPublishToUserGroup({ from: author2, to: group });
      const alteredKP = setRecipientKeyPublish(keyPublishToGroup, new Uint8Array(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE), NATURE.key_publish_to_user_group);

      const result = await builder.trustchainVerifier.verifyKeyPublishes([alteredKP.unverifiedKeyPublish]);
      expect(result.length).to.equal(0);
    });
  });
});

