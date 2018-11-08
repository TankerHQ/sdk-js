// @flow
/* eslint-disable no-underscore-dangle */

import { tcrypto } from '@tanker/crypto';

import { expect } from './chai';
import { InvalidBlockError } from '../errors';
import { type UnverifiedEntry, blockToEntry } from '../Blocks/entries';
import { type GeneratorKeyResult, type GeneratorUserResult } from './Generator';
import { signBlock, type Block } from '../Blocks/Block';
import TrustchainBuilder, { makeTrustchainBuilder } from './TrustchainBuilder';
import UserStore from '../Users/UserStore';
import {
  serializeKeyPublish,
  NATURE, type Nature,
} from '../Blocks/payloads';


type EntryBlockSignParam = {
  entry: UnverifiedEntry,
  block: Block,
  blockPrivateSignatureKey: Uint8Array,
};

async function assertFailsWithNature(promise: Promise<*>, nature: string): Promise<void> {
  await expect(promise)
    .to.be.rejectedWith(InvalidBlockError)
    .and.eventually.have.property('nature', nature);
}

function mergeBlock<T: EntryBlockSignParam>(user: T, block: Object, maybeBlockPrivateSignatureKey = null): T {
  const blockPrivateSignatureKey = maybeBlockPrivateSignatureKey || user.blockPrivateSignatureKey;
  const newBlock = { ...user.block, ...block };
  const entry = blockToEntry(signBlock(newBlock, blockPrivateSignatureKey));
  return { ...user, block: newBlock, entry };
}

function mergeKeyPublish(serializeFunction: Function, kp: GeneratorKeyResult, payload: Object, maybeBlockPrivateSignatureKey = null): GeneratorKeyResult {
  const alteredPayload = { ...(kp.entry.payload_unverified: any), ...(payload: any) };
  const serializedPayload = serializeFunction(alteredPayload);
  const merged = mergeBlock(kp, { payload: serializedPayload }, maybeBlockPrivateSignatureKey);
  merged.unverifiedKeyPublish = {
    ...(merged.entry: any),
    ...merged.entry.payload_unverified,
  };
  return merged;
}

function setKeyPublishAuthor(keyPublish: GeneratorKeyResult, author: Uint8Array, maybeBlockPrivateSignatureKey: ?Uint8Array): GeneratorKeyResult {
  const merged = mergeBlock(keyPublish, { author }, maybeBlockPrivateSignatureKey);
  return {
    ...merged,
    unverifiedKeyPublish: {
      ...merged.entry,
      ...merged.entry.payload_unverified,
    },
  };
}

function setRecipientKeyPublish(kp: GeneratorKeyResult, recipient: Uint8Array, nature: Nature, maybeBlockPrivateSignatureKey: ?Uint8Array): GeneratorKeyResult {
  const payload = {
    recipient,
  };
  switch (nature) {
    case NATURE.key_publish_to_device:
      return mergeKeyPublish(serializeKeyPublish, kp, payload, maybeBlockPrivateSignatureKey);
    case NATURE.key_publish_to_user:
      return mergeKeyPublish(serializeKeyPublish, kp, payload, maybeBlockPrivateSignatureKey);
    case NATURE.key_publish_to_user_group:
      return mergeKeyPublish(serializeKeyPublish, kp, payload, maybeBlockPrivateSignatureKey);
    default:
      throw new Error('Invalid key publish nature');
  }
}

describe('TrustchainVerifier', () => {
  describe('block validation', () => {
    it('should reject a block with an unknown author', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      await generator.newUserCreationV3('alice');
      const alice = await generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });
      await builder.unverifiedStore.addUnverifiedUserEntries([blockToEntry(alice.block)]);
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
      expect(await userStore.findDevice({ deviceId: author.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: authorDevice.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: author2.entry.hash })).to.not.be.null;
    });

    it('fails to verify keypublishes with bad authors', async () => {
      const keyPublish = await builder.addKeyPublishToUser({ from: author, to: user });
      const keyPublish2 = await builder.addKeyPublishToUser({ from: author2, to: user });
      const alteredKP2 = setKeyPublishAuthor(keyPublish2, keyPublish.entry.hash);

      const result = await builder.trustchainVerifier.verifyKeyPublishes([keyPublish.unverifiedKeyPublish, alteredKP2.unverifiedKeyPublish]);
      expect(result.length).to.equal(1);
      expect(await userStore.findDevice({ deviceId: author.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: authorDevice.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: author2.entry.hash })).to.be.null;
    });

    it('verified group block', async () => {
      const group = await builder.addUserGroupCreation(author, ['alice']);

      const keyPublishToGroup = await builder.addKeyPublishToUserGroup({ from: author2, to: group });

      const result = await builder.trustchainVerifier.verifyKeyPublishes([keyPublishToGroup.unverifiedKeyPublish]);
      expect(result.length).to.equal(1);
      expect(await userStore.findDevice({ deviceId: author.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: authorDevice.entry.hash })).to.not.be.null;
      expect(await userStore.findDevice({ deviceId: author2.entry.hash })).to.not.be.null;

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
