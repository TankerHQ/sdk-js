// @flow
/* eslint-disable no-underscore-dangle */
import { tcrypto, random, utils } from '@tanker/crypto';

import { expect } from './chai';
import { InvalidBlockError } from '../errors';
import { type UnverifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import { type Device } from '../Users/UserStore';
import type { UnverifiedEntry } from '../Blocks/entries';
import Generator, { type GeneratorUserResult, type GeneratorKeyResult, type GeneratorRevocationResult, type GeneratorUserGroupResult, type GeneratorUserGroupAdditionResult } from './Generator';
import { signBlock, type Block } from '../Blocks/Block';
import { blockToEntry } from '../Trustchain/TrustchainStore';
import TrustchainBuilder, { makeTrustchainBuilder } from './TrustchainBuilder';
import {
  type UserDeviceRecord, serializeUserDeviceV3, serializeDeviceRevocationV2,
  type UserKeys, type UserKeyPair, serializeKeyPublish, serializeKeyPublishToUser, serializeKeyPublishToUserGroup,
  type UserGroupCreationRecord, serializeUserGroupCreation,
  type DeviceRevocationRecord,
  NATURE, type Nature,
  type UserGroupAdditionRecord, serializeUserGroupAddition,
} from '../Blocks/payloads';
import { DEVICE_TYPE } from '../Unlock/unlock';
import makeUint8Array from './makeUint8Array';

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

function mergeDeviceCreationV3Payload(user: GeneratorUserResult, payload: Object, maybeBlockPrivateSignatureKey = null): GeneratorUserResult {
  const alteredPayload: UserDeviceRecord = { ...(user.entry.payload_unverified: any), ...(payload: any) };
  const serializedPayload = serializeUserDeviceV3(alteredPayload);
  const merged = mergeBlock(user, { payload: serializedPayload }, maybeBlockPrivateSignatureKey);
  merged.unverifiedDeviceCreation = {
    ...(merged.entry: any),
    ...merged.entry.payload_unverified,
  };
  return merged;
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

function mergeDeviceRevocationV2Payload(dr: GeneratorRevocationResult, payload: Object, maybeBlockPrivateSignatureKey = null): GeneratorRevocationResult {
  const alteredPayload: DeviceRevocationRecord = { ...(dr.entry.payload_unverified: any), ...(payload: any) };
  const serializedPayload = serializeDeviceRevocationV2(alteredPayload);
  return mergeBlock(dr, { payload: serializedPayload }, maybeBlockPrivateSignatureKey);
}

function mergeUserGroupCreationPayload(gc: GeneratorUserGroupResult, payload: Object, maybeBlockPrivateSignatureKey = null): GeneratorUserGroupResult {
  const alteredPayload: UserGroupCreationRecord = { ...(gc.entry.payload_unverified: any), ...(payload: any) };
  const serializedPayload = serializeUserGroupCreation(alteredPayload);
  return mergeBlock(gc, { payload: serializedPayload }, maybeBlockPrivateSignatureKey);
}

function mergeUserGroupAdditionPayload(gc: GeneratorUserGroupAdditionResult, payload: Object): GeneratorUserGroupAdditionResult {
  const alteredPayload: UserGroupAdditionRecord = { ...(gc.entry.payload_unverified: any), ...(payload: any) };
  const serializedPayload = serializeUserGroupAddition(alteredPayload);
  return mergeBlock(gc, { payload: serializedPayload });
}


// the block will be signed by the private ephemeralKeys because of the delegation
function setDelegationKey(user: GeneratorUserResult, ephemeralKeys, delegationPrivateSignatureKey): GeneratorUserResult {
  if (!user.entry.user_id)
    throw new Error('missing user_id');
  const delegationToken = utils.concatArrays(ephemeralKeys.publicKey, user.entry.user_id);
  const payload = {
    delegation_signature: tcrypto.sign(delegationToken, delegationPrivateSignatureKey),
    ephemeral_public_signature_key: ephemeralKeys.publicKey,
  };
  return mergeDeviceCreationV3Payload(user, payload, ephemeralKeys.privateKey);
}

function setUserId(user: GeneratorUserResult, userId: Uint8Array, maybeBlockPrivateSignatureKey): GeneratorUserResult {
  const payload = {
    user_id: userId,
  };
  return mergeDeviceCreationV3Payload(user, payload, maybeBlockPrivateSignatureKey);
}

function setDeviceAuthor(user: GeneratorUserResult, author: Uint8Array, maybeBlockPrivateSignatureKey): GeneratorUserResult {
  const merged = mergeBlock(user, { author }, maybeBlockPrivateSignatureKey);
  merged.unverifiedDeviceCreation = {
    ...(merged.entry: any),
    ...merged.entry.payload_unverified,
  };
  return merged;
}

function setRevocationAuthor(revocation: GeneratorRevocationResult, author: Uint8Array, maybeBlockPrivateSignatureKey): GeneratorRevocationResult {
  const merged = mergeBlock(revocation, { author }, maybeBlockPrivateSignatureKey);
  merged.unverifiedDeviceRevocation = {
    ...(merged.entry: any),
    ...merged.entry.payload_unverified,
    user_id: revocation.unverifiedDeviceRevocation.user_id,
  };
  return merged;
}


export function setKeyPublishAuthor(keyPublish: GeneratorKeyResult, author: Uint8Array, maybeBlockPrivateSignatureKey: ?Uint8Array): GeneratorKeyResult {
  const merged = mergeBlock(keyPublish, { author }, maybeBlockPrivateSignatureKey);
  return {
    ...merged,
    unverifiedKeyPublish: {
      ...merged.entry,
      ...merged.entry.payload_unverified,
    },
  };
}

function setUserKeyPair(user: GeneratorUserResult, userKeyPair: ?UserKeyPair, maybeBlockPrivateSignatureKey): GeneratorUserResult {
  const payload = {
    user_key_pair: userKeyPair,
  };
  return mergeDeviceCreationV3Payload(user, payload, maybeBlockPrivateSignatureKey);
}

export function setRecipientKeyPublish(kp: GeneratorKeyResult, recipient: Uint8Array, nature: Nature, maybeBlockPrivateSignatureKey: ?Uint8Array): GeneratorKeyResult {
  const payload = {
    recipient,
  };
  switch (nature) {
    case NATURE.key_publish_to_device:
      return mergeKeyPublish(serializeKeyPublish, kp, payload, maybeBlockPrivateSignatureKey);
    case NATURE.key_publish_to_user:
      return mergeKeyPublish(serializeKeyPublishToUser, kp, payload, maybeBlockPrivateSignatureKey);
    case NATURE.key_publish_to_user_group:
      return mergeKeyPublish(serializeKeyPublishToUserGroup, kp, payload, maybeBlockPrivateSignatureKey);
    default:
      throw new Error('Invalid key publish nature');
  }
}

function setUserKeysRevocation(revocation: GeneratorRevocationResult, userKeys: ?UserKeys, maybeBlockPrivateSignatureKey): GeneratorRevocationResult {
  const payload = {
    user_keys: userKeys,
  };
  return mergeDeviceRevocationV2Payload(revocation, payload, maybeBlockPrivateSignatureKey);
}

function setSelfSignatureUserGroupCreation(group: GeneratorUserGroupResult, signature: Uint8Array, maybeBlockPrivateSignatureKey): GeneratorUserGroupResult {
  const payload = {
    self_signature: signature,
  };
  return mergeUserGroupCreationPayload(group, payload, maybeBlockPrivateSignatureKey);
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

    it('should reject a block with an invalid signature field', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      const alice = await builder.addUserV3('alice');
      const aliceDev = await builder.addDeviceV3({ id: 'alice', parentIndex: 0 });
      const revocation = await generator.newDeviceRevocationV2(alice.device, aliceDev.device);
      const entry = blockToEntry(revocation.block);
      entry.signature[0] += 1;
      await builder.unverifiedStore.addUnverifiedUserEntries([entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(revocation.unverifiedDeviceRevocation), 'invalid_signature');
    });
  });

  describe('Trustchain creation', () => {
    it('should reject a root block with an author that is not 0', async () => {
      const builder = await makeTrustchainBuilder(true);
      const alice = await builder.addUserV3('alice');

      const unsignedBrokenRootBlock = builder.generator.root.block;
      unsignedBrokenRootBlock.author = alice.device.id;
      const brokenRootBlock = signBlock(unsignedBrokenRootBlock, alice.device.signKeys.privateKey);
      const brokenEntry = blockToEntry(brokenRootBlock);
      await assertFailsWithNature(builder.trustchainVerifier.verifyTrustchainCreation(brokenEntry), 'invalid_author_for_trustchain_creation');
    });

    it('should reject a root block incorrectly signed', async () => {
      const builder = await makeTrustchainBuilder(true);
      builder.generator.root.block.signature[0] += 1;
      const { entry } = builder.generator.root;
      await assertFailsWithNature(builder.trustchainVerifier.verifyTrustchainCreation(entry), 'invalid_signature');
    });

    it('should reject a root block for another trustchain', async () => {
      const builder = await makeTrustchainBuilder(true);
      const { block } = builder.generator.root;
      block.payload[0] += 1;
      const entry = blockToEntry(block);
      await assertFailsWithNature(builder.trustchainVerifier.verifyTrustchainCreation(entry), 'invalid_root_block');
    });

    it('should reject a root block if the hash of the block does not match the trustchainId', async () => {
      const builder = await makeTrustchainBuilder(true);
      const { generator } = await makeTrustchainBuilder();
      const otherRootEntry = generator.root.entry;
      await assertFailsWithNature(builder.trustchainVerifier.verifyTrustchainCreation(otherRootEntry), 'invalid_root_block');
    });

    it('should accept a root block if all the requirements are met', async () => {
      const builder = await makeTrustchainBuilder();

      const entry = blockToEntry(builder.generator.pushedBlocks[0]);
      await expect(builder.trustchainVerifier.verifyTrustchainCreation(entry)).to.be.fulfilled;
    });
  });

  describe('device creation', () => {
    it('should reject a device creation by a revoked author', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      await builder.addDeviceRevocationV2(alice, alice);
      alice.user.devices = [alice.device, ...alice.user.devices]; // Blatantly ignore revocation

      const aliceBad = await builder.addDeviceV3({ id: 'alice' });
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(aliceBad.unverifiedDeviceCreation), 'revoked_author_error');
    });

    it('should reject a device creation if the user id is not unique', async () => {
      const builder = await makeTrustchainBuilder();

      await builder.addUserV3('alice');
      const alice2 = await builder.generator.newUserCreationV3('alice', { unsafe: true });

      await builder.unverifiedStore.addUnverifiedUserEntries([alice2.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice2.unverifiedDeviceCreation), 'forbidden');
    });

    it('should reject a second device if the parent has a different user_id', async () => {
      const builder = await makeTrustchainBuilder();
      const alice = await builder.addUserV3('alice');
      const alice1: GeneratorUserResult = await builder.generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });

      const ephemeralKeys = tcrypto.makeSignKeyPair();

      // we fork alice device to ensure the block is correctly linked to the first alice device.
      const notAlice = setUserId(alice1, builder.userId('not alice'));
      // once we set the new user_id, we have to generate a new delegation (cause the delegation includes the user_id)
      const notAliceAltered = setDelegationKey(notAlice, ephemeralKeys, alice.device.signKeys.privateKey);
      await builder.unverifiedStore.addUnverifiedUserEntries([notAliceAltered.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(notAliceAltered.unverifiedDeviceCreation), 'unknown_author');
    });

    it('should reject a device without author', async () => {
      const builder = await makeTrustchainBuilder();

      await builder.addUserV3('alice');
      const alice = await builder.generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });

      const newAuthor = new Uint8Array(tcrypto.HASH_SIZE);
      const newAlice = setDeviceAuthor(alice, newAuthor);
      await builder.unverifiedStore.addUnverifiedUserEntries([newAlice.entry]);

      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(newAlice.unverifiedDeviceCreation), 'unknown_author');
    });

    it('should reject an incorrectly signed delegation for a device', async () => {
      const builder = await makeTrustchainBuilder();
      await builder.addUserV3('alice');
      const alice2 = await builder.generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });

      const newDelegationSignature = (alice2.entry.payload_unverified: any).delegation_signature;
      newDelegationSignature[0] += 1;
      mergeDeviceCreationV3Payload(alice2, { delegation_signature: newDelegationSignature });

      await builder.unverifiedStore.addUnverifiedUserEntries([alice2.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice2.unverifiedDeviceCreation), 'invalid_delegation_signature');
    });

    it('should reject an incorrectly signed device', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.generator.newUserCreationV3('alice');
      alice.block.signature[0] += 1;
      const entry = blockToEntry(alice.block);
      await builder.unverifiedStore.addUnverifiedUserEntries([entry]);

      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice.unverifiedDeviceCreation), 'invalid_signature');
    });

    it('should reject a deviceCreationV1 if the user_key is not null', async () => {
      const builder = await makeTrustchainBuilder();

      await builder.addUserV3('alice');
      const alice = await builder.addDeviceV1({ id: 'alice', parentIndex: 0 });
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice.unverifiedDeviceCreation), 'forbidden');
    });

    it('should reject a deviceCreationV3 if the userPublicKey is not the same as it\'s parent one', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const userKeyPair = ((alice.entry.payload_unverified: any): UserDeviceRecord).user_key_pair;
      if (userKeyPair)
        userKeyPair.public_encryption_key[0] += 1;
      const aliceDevice: GeneratorUserResult = await builder.generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });
      const aliceDeviceIncorrect = setUserKeyPair(aliceDevice, userKeyPair);
      await builder.unverifiedStore.addUnverifiedUserEntries([aliceDeviceIncorrect.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(aliceDeviceIncorrect.unverifiedDeviceCreation), 'invalid_public_user_key');
    });

    it('should reject a deviceCreationV3 if the parent device is a client, and the new one a server', async () => {
      const builder = await makeTrustchainBuilder();

      await builder.addUserV3('alice');
      const aliceDeviceIncorrect: GeneratorUserResult = await builder.generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0, deviceType: DEVICE_TYPE.server_device });
      await builder.unverifiedStore.addUnverifiedUserEntries([aliceDeviceIncorrect.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(aliceDeviceIncorrect.unverifiedDeviceCreation), 'invalid_author_type');
    });

    it('should reject a deviceCreationV3 if the parent device is a server, and the new one a client', async () => {
      const builder = await makeTrustchainBuilder();

      await builder.addUserV3('alice', DEVICE_TYPE.server_device);
      const aliceDeviceIncorrect: GeneratorUserResult = await builder.generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0, deviceType: DEVICE_TYPE.client_device });
      await builder.unverifiedStore.addUnverifiedUserEntries([aliceDeviceIncorrect.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceCreation(aliceDeviceIncorrect.unverifiedDeviceCreation), 'invalid_author_type');
    });

    it('should accept a deviceCreationV1 if all requirements are met', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV1('alice');
      await expect(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice.unverifiedDeviceCreation)).to.be.fulfilled;
    });

    it('should accept a deviceCreationV3 if all requirements are met', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      await expect(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice.unverifiedDeviceCreation)).to.be.fulfilled;
    });

    it('should accept a second deviceCreationV1 if all requirements are met', async () => {
      const builder = await makeTrustchainBuilder();

      await builder.addUserV1('alice');
      const alice2 = await builder.addDeviceV1({ id: 'alice' });
      await expect(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice2.unverifiedDeviceCreation)).to.be.fulfilled;
    });

    it('should accept a second deviceCreationV3 if all requirements are met', async () => {
      const builder = await makeTrustchainBuilder();

      await builder.addUserV3('alice');
      const alice2 = await builder.addDeviceV3({ id: 'alice' });
      await expect(builder.trustchainVerifier._throwingVerifyDeviceCreation(alice2.unverifiedDeviceCreation)).to.be.fulfilled;
    });
  });

  function transform(entry: UnverifiedEntry): Array<UnverifiedKeyPublish> {
    return [{ ...entry, ...entry.payload_unverified }];
  }
  describe('key publish', () => {
    let builder: TrustchainBuilder;
    let generator: Generator;
    let userV1: GeneratorUserResult;
    let userV3: GeneratorUserResult;
    let author: GeneratorUserResult;
    let verifiedAuthorDevice: Device;

    beforeEach(async () => {
      builder = await makeTrustchainBuilder();
      ({ generator } = builder);
      userV1 = await builder.addUserV1('alice');
      userV3 = await builder.addUserV3('dave');
      author = await builder.addUserV3('bob');

      await builder.trustchainVerifier.verifyDeviceCreation(userV1.unverifiedDeviceCreation);
      await builder.trustchainVerifier.verifyDeviceCreation(userV3.unverifiedDeviceCreation);
      await builder.trustchainVerifier.verifyDeviceCreation(author.unverifiedDeviceCreation);
      verifiedAuthorDevice = await builder.userStore.findDevice({ hashedDeviceId: author.device.id });
    });

    it('should accept a correct key publish to device', async () => {
      const keyPublish = await generator.newKeyPublishToDevice({ toDevice: userV1.device, fromDevice: author.device });
      const verifPromise = builder.trustchainVerifier._verifyKeyPublishEntry(keyPublish.unverifiedKeyPublish, verifiedAuthorDevice);
      await expect(verifPromise).to.be.fulfilled;
    });

    it('should reject a keyPublish to device with an invalid signature', async () => {
      const keyPublish = await builder.generator.newKeyPublishToDevice({
        toDevice: userV1.device,
        fromDevice: author.device
      });
      keyPublish.entry.signature[0] += 1;

      const verifPromise = builder.trustchainVerifier._verifyKeyPublishEntry(keyPublish.unverifiedKeyPublish, verifiedAuthorDevice);
      await assertFailsWithNature(verifPromise, 'invalid_signature');
    });

    it('should reject a key publish to device with a null recipient', async () => {
      const kp = await builder.generator.newKeyPublishToDevice({ toDevice: userV1.device, fromDevice: author.device });
      const newRecipient = new Uint8Array(tcrypto.HASH_SIZE);
      const newKp = setRecipientKeyPublish(kp, newRecipient, NATURE.key_publish_to_device);

      const verifPromise = builder.trustchainVerifier._verifyKeyPublishEntry(newKp.unverifiedKeyPublish, verifiedAuthorDevice);
      await assertFailsWithNature(verifPromise, 'invalid_recipient');
    });

    it('should reject a key publish to device if the recipient has a user key', async () => {
      const keyPublish = await generator.newKeyPublishToDevice({ toDevice: userV3.device, fromDevice: author.device });
      const verifPromise = builder.trustchainVerifier._verifyKeyPublishEntry(keyPublish.unverifiedKeyPublish, verifiedAuthorDevice);
      await assertFailsWithNature(verifPromise, 'version_mismatch');
    });

    it('should reject a key publish to device if the recipient is the hash of a device revocation', async () => {
      const revoc = await generator.newDeviceRevocationV2(userV1.device, { id: userV1.device.id });

      const keyPublish = await generator.newKeyPublishToDevice({ toDevice: userV1.device, fromDevice: author.device });
      const newKp = setRecipientKeyPublish(keyPublish, revoc.entry.hash, NATURE.key_publish_to_device);
      const verifPromise = builder.trustchainVerifier._verifyKeyPublishEntry(newKp.unverifiedKeyPublish, verifiedAuthorDevice);
      await assertFailsWithNature(verifPromise, 'invalid_recipient');
    });

    it('should reject a key publish to user with a recipient that has a superseeded user public key', async () => {
      const keyPublish = await generator.newKeyPublishToUser({ toUser: userV3.user, fromDevice: author.device });
      const revoc = await builder.addDeviceRevocationV2(userV3, userV3);
      keyPublish.unverifiedKeyPublish.index = revoc.entry.index + 1;

      await builder.trustchainVerifier._throwingVerifyDeviceRevocation(revoc.unverifiedDeviceRevocation);
      const verifPromise = builder.trustchainVerifier._verifyKeyPublishEntry(keyPublish.unverifiedKeyPublish, verifiedAuthorDevice);
      await assertFailsWithNature(verifPromise, 'invalid_user_public_key');
    });
  });

  describe('device revocation', () => {
    it('should reject a revocation with a null author', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      const alice = await builder.addUserV3('alice');
      const revocation = await generator.newDeviceRevocationV2(alice.device, alice.device);

      const newAuthor = new Uint8Array(tcrypto.HASH_SIZE);
      const newRevocation = setRevocationAuthor(revocation, newAuthor, builder.trustchainKeyPair.privateKey);

      await builder.unverifiedStore.addUnverifiedUserEntries([newRevocation.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(newRevocation.unverifiedDeviceRevocation), 'unknown_author');
    });

    it('should reject a revocation with an author that is not a device creation', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      const alice = await builder.addUserV3('alice');
      const keyPublish = await builder.addKeyPublishToUser({ from: alice, to: alice });
      const revocation = await generator.newDeviceRevocationV2(alice.device, alice.device);

      const newAuthor = keyPublish.entry.hash;
      const newRevocation = setRevocationAuthor(revocation, newAuthor, builder.trustchainKeyPair.privateKey);

      await builder.unverifiedStore.addUnverifiedUserEntries([newRevocation.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(newRevocation.unverifiedDeviceRevocation), 'unknown_author');
    });

    it('should reject a revocation with an author that is another user', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const bob = await builder.addUserV3('bob');

      const revocation = await builder.addDeviceRevocationV2(alice, bob);

      // The user store keeps each user isolated. If a block touches a device of user B, and the author isn't B then it doesn't even pass the author fetch checks.
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(revocation.unverifiedDeviceRevocation), 'unknown_author');
    });

    it('should thoroughly reject a revocation with an author that is another user, at every step of the way', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const bob = await builder.addUserV3('bob');

      const revocation = await builder.addDeviceRevocationV2(alice, bob);
      await builder.trustchainVerifier._throwingVerifyDeviceCreation(bob.unverifiedDeviceCreation);

      const authorUserId = utils.toBase64(alice.unverifiedDeviceCreation.user_id);
      const authorKey = alice.device.signKeys.publicKey;
      const targetUser = await builder.userStore.findUser({ hashedUserId: bob.unverifiedDeviceCreation.user_id });

      // If we somehow let through a block with a bad author, this is caught again by the block verification rules.
      await assertFailsWithNature(builder.trustchainVerifier._verifyDeviceRevocationEntry(revocation.unverifiedDeviceRevocation, authorUserId, authorKey, targetUser), 'forbidden');
    });

    it('should reject a revocation of a device that doesn\'t exist', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const bob = await builder.generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });

      const revocation = await builder.addDeviceRevocationV2(alice, bob);

      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(revocation.unverifiedDeviceRevocation), 'invalid_revoked_device');
    });

    it('should reject a revocation with an invalid signature', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      builder.generator.trustchainIndex += 1;

      const revocation = await builder.generator.newDeviceRevocationV2(alice.device, alice.device);
      revocation.entry.signature[0] += 1;
      await builder.unverifiedStore.addUnverifiedUserEntries([revocation.entry]);

      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(revocation.unverifiedDeviceRevocation), 'invalid_signature');
    });

    it('should reject a revocation of an already revoked device', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const alice2 = await builder.addDeviceV3({ id: 'alice', parentIndex: 0 });
      await builder.addDeviceRevocationV2(alice, alice2);
      const revocation2 = await builder.addDeviceRevocationV2(alice, alice2);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(revocation2.unverifiedDeviceRevocation), 'device_already_revoked');
    });

    it('should reject a revocation v1 if the user has a user key', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const revocation = await builder.generator.newDeviceRevocationV1(alice.device, { id: alice.device.id }, { unsafe: true });
      await builder.unverifiedStore.addUnverifiedUserEntries([revocation.entry]);
      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(revocation.unverifiedDeviceRevocation), 'invalid_revocation_version');
    });

    it('should accept a revocation v1 when all requirements are met', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV1('alice');
      const alice2 = await builder.addDeviceV1({ id: 'alice', parentIndex: 0 });
      const revocation = await builder.addDeviceRevocationV1(alice, alice2);
      await expect(builder.trustchainVerifier._throwingVerifyDeviceRevocation(revocation.unverifiedDeviceRevocation)).to.be.fulfilled;
    });

    it('should reject a revocation v2 with too many elements in the private_keys field', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      const alice = await builder.addUserV3('alice');
      const revocation = await generator.newDeviceRevocationV2(alice.device, alice.device);
      const userKeys = ((revocation.entry.payload_unverified: any): DeviceRevocationRecord).user_keys;
      if (!userKeys)
        throw new Error('this should never happen, revocation V2 should have a userKeys');
      userKeys.private_keys.push({
        recipient: new Uint8Array(tcrypto.HASH_SIZE),
        key: new Uint8Array(tcrypto.SEALED_KEY_SIZE),
      });

      const newRevocation = setUserKeysRevocation(revocation, userKeys);
      await builder.unverifiedStore.addUnverifiedUserEntries([newRevocation.entry]);

      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(newRevocation.unverifiedDeviceRevocation), 'invalid_new_key');
    });

    it('should reject a revocation v2 with too few elements in the private_keys field', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      const alice = await builder.addUserV3('alice');
      const alice2 = await builder.addDeviceV3({ id: 'alice', parentIndex: 0 });
      const revocation = await generator.newDeviceRevocationV2(alice2.device, alice.device);
      const userKeys = ((revocation.entry.payload_unverified: any): DeviceRevocationRecord).user_keys;
      if (!userKeys)
        throw new Error('this should never happen, revocation V2 should have a userKeys');
      userKeys.private_keys.pop();

      const newRevocation = setUserKeysRevocation(revocation, userKeys);
      await builder.unverifiedStore.addUnverifiedUserEntries([newRevocation.entry]);

      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(newRevocation.unverifiedDeviceRevocation), 'invalid_new_key');
    });


    it('should reject a revocation v2 with an encrypted_keys_for_devices that does not target the users devices', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      const alice = await builder.addUserV3('alice');
      await builder.addDeviceV3({ id: 'alice', parentIndex: 0 });
      const bob = await builder.addUserV3('bob');
      const bob2 = await builder.addDeviceV3({ id: 'bob', parentIndex: 0 });
      const revocation1 = await builder.addDeviceRevocationV2(bob, bob2);
      const revocation2 = await generator.newDeviceRevocationV2(alice.device, alice.device);
      const userKeysBob = ((revocation1.entry.payload_unverified: any): DeviceRevocationRecord).user_keys;
      const userKeysAlice = ((revocation2.entry.payload_unverified: any): DeviceRevocationRecord).user_keys;
      if (!userKeysAlice || !userKeysBob)
        throw new Error('this should never happen, revocation V2 should have a userKeys');

      userKeysAlice.private_keys = userKeysBob.private_keys;
      const newRevocation = setUserKeysRevocation(revocation2, userKeysAlice);
      await builder.unverifiedStore.addUnverifiedUserEntries([newRevocation.entry]);

      await assertFailsWithNature(builder.trustchainVerifier._throwingVerifyDeviceRevocation(newRevocation.unverifiedDeviceRevocation), 'invalid_new_key');
    });

    it('should accept a revocation v2 when all requirements are met', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const alice2 = await builder.addDeviceV3({ id: 'alice', parentIndex: 0 });
      const revocation = await builder.addDeviceRevocationV2(alice, alice2);
      await expect(builder.trustchainVerifier._throwingVerifyDeviceRevocation(revocation.unverifiedDeviceRevocation)).to.be.fulfilled;
    });
  });

  describe('group creation', () => {
    it('should accept a valid group creation', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const group = await builder.addUserGroupCreation(alice, ['alice']);

      const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);
      const groupId = payload.public_signature_key;

      await builder.trustchainVerifier.updateGroupStore([groupId]);

      const verifiedgroup = await builder.groupStore.findExternal({ groupId });
      expect(!!verifiedgroup).to.be.true;
    });

    it('should reject a group creation with bad signature', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      const alice = await builder.addUserV3('alice');
      const group = await generator.newUserGroupCreation(alice.device, ['alice']);
      const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);
      const groupId = payload.public_signature_key;

      group.block.signature[0] += 1;
      const entry = blockToEntry(group.block);
      await builder.unverifiedStore.addUnverifiedUserGroups([entry]);

      await assertFailsWithNature(builder.trustchainVerifier.updateGroupStore([groupId]), 'invalid_signature');
    });

    it('should reject a group creation with bad self-signature', async () => {
      const builder = await makeTrustchainBuilder();
      const { generator } = builder;
      const alice = await builder.addUserV3('alice');
      const group = await generator.newUserGroupCreation(alice.device, ['alice']);
      const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);
      const groupId = payload.public_signature_key;

      const newGroupCreation = setSelfSignatureUserGroupCreation(group, new Uint8Array(tcrypto.SIGNATURE_SIZE));
      await builder.unverifiedStore.addUnverifiedUserGroups([newGroupCreation.entry]);

      await assertFailsWithNature(builder.trustchainVerifier.updateGroupStore([groupId]), 'invalid_self_signature');
    });

    it('should reject a group creation if it already exists', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const group = await builder.addUserGroupCreation(alice, ['alice']);
      const payload: UserGroupCreationRecord = (group.entry.payload_unverified: any);
      const groupId = payload.public_signature_key;

      await builder.groupStore.putExternal({
        groupId: payload.public_signature_key,
        publicSignatureKey: payload.public_signature_key,
        publicEncryptionKey: makeUint8Array('wrong encryption key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
        encryptedPrivateSignatureKey: makeUint8Array('priv sig', tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE),
        lastGroupBlock: group.entry.hash,
        index: group.entry.index,
      });

      await assertFailsWithNature(builder.trustchainVerifier.updateGroupStore([groupId]), 'group_already_exists');
    });
  });

  describe('group addition', () => {
    let builder: TrustchainBuilder;
    let generator: Generator;
    let alice: GeneratorUserResult;
    let group: GeneratorUserGroupResult;
    let groupId;

    beforeEach(async () => {
      builder = await makeTrustchainBuilder();
      ({ generator } = builder);

      alice = await builder.addUserV3('alice');
      await builder.addUserV3('bob');
      group = await builder.addUserGroupCreation(alice, ['alice']);
      groupId = (group.entry.payload_unverified: any).public_signature_key;
    });

    it('should accept a valid group addition', async () => {
      await builder.addUserGroupAddition(alice, group, ['bob']);
      await builder.trustchainVerifier.updateGroupStore([groupId]);
    });

    it('should reject a group addition with bad signature', async () => {
      const groupAddition = await generator.newUserGroupAddition(alice.device, group, ['bob']);
      groupAddition.entry.signature[0] += 1;
      await builder.unverifiedStore.addUnverifiedUserGroups([groupAddition.entry]);

      await assertFailsWithNature(builder.trustchainVerifier.updateGroupStore([groupId]), 'invalid_signature');
    });

    it('should reject a group addition with bad self-signature', async () => {
      let groupAddition = await generator.newUserGroupAddition(alice.device, group, ['bob']);
      const payload = {
        self_signature_with_current_key: new Uint8Array(tcrypto.SIGNATURE_SIZE),
      };
      groupAddition = mergeUserGroupAdditionPayload(groupAddition, payload);
      await builder.unverifiedStore.addUnverifiedUserGroups([groupAddition.entry]);

      await assertFailsWithNature(builder.trustchainVerifier.updateGroupStore([groupId]), 'invalid_self_signature');
    });

    it('should reject a group addition if previous_group_block is wrong', async () => {
      let groupAddition = await generator.newUserGroupAddition(alice.device, group, ['bob']);
      const payload = {
        previous_group_block: new Uint8Array(tcrypto.HASH_SIZE),
      };
      groupAddition = mergeUserGroupAdditionPayload(groupAddition, payload);
      await builder.unverifiedStore.addUnverifiedUserGroups([groupAddition.entry]);

      await assertFailsWithNature(builder.trustchainVerifier.updateGroupStore([groupId]), 'invalid_previous_group_block');
    });
  });

  describe('key publish to user group', () => {
    it('should accept a valid kp2ug', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const group = await builder.addUserGroupCreation(alice, ['alice']);
      const kp = await builder.addKeyPublishToUserGroup({ to: group, from: alice });

      builder.groupUpdater._keystore = await builder.getKeystoreOfDevice(alice.user, alice.device); // eslint-disable-line no-underscore-dangle

      const passed = await builder.trustchainVerifier.verifyKeyPublishes(transform(kp.entry));
      expect(passed.length).to.equal(1);
    });

    it('should reject a kp2ug with a bad recipient', async () => {
      const builder = await makeTrustchainBuilder();

      const alice = await builder.addUserV3('alice');
      const group = await builder.addUserGroupCreation(alice, ['alice']);
      group.groupEncryptionKeyPair.publicKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
      const kp = await builder.addKeyPublishToUserGroup({ to: group, from: alice });

      const passed = await builder.trustchainVerifier.verifyKeyPublishes(transform(kp.entry));
      expect(passed.length).to.equal(0);
    });
  });
});
