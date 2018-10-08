// @flow

import { tcrypto } from '@tanker/crypto';

import { expect } from '@tanker/chai';
import { makeTrustchainBuilder } from './TrustchainBuilder';
import { generatorUserToUser } from './Generator';
import { makeBuffer } from './utils';
import { concatArrays } from '../Blocks/Serialize';
import { type UserGroupCreationRecord, type UserGroupAdditionRecord } from '../Blocks/payloads';
import { getUserGroupCreationBlockSignData, getUserGroupAdditionBlockSignData } from '../Blocks/BlockGenerator';

import { blockToEntry } from '../Trustchain/TrustchainStore';

describe('BlockGenerator', () => {
  it('order stuff correctly for UserGroupCreation sign data', async () => {
    const record = {
      public_signature_key: makeBuffer('pub sign key', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
      public_encryption_key: makeBuffer('pub enc key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
      encrypted_group_private_signature_key: makeBuffer('enc group priv stuff', tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE),
      encrypted_group_private_encryption_keys_for_users: [
        {
          public_user_encryption_key: makeBuffer('user pub enc key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeBuffer('enc group priv enc key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        },
        {
          public_user_encryption_key: makeBuffer('user pub enc key 2', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeBuffer('enc group priv enc key 2', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        }],
      self_signature: new Uint8Array(0),
    };

    const expectedSignData = concatArrays(
      record.public_signature_key,
      record.public_encryption_key,
      record.encrypted_group_private_signature_key,
      record.encrypted_group_private_encryption_keys_for_users[0].public_user_encryption_key,
      record.encrypted_group_private_encryption_keys_for_users[0].encrypted_group_private_encryption_key,
      record.encrypted_group_private_encryption_keys_for_users[1].public_user_encryption_key,
      record.encrypted_group_private_encryption_keys_for_users[1].encrypted_group_private_encryption_key,
    );

    const gotSignData = getUserGroupCreationBlockSignData(record);

    expect(gotSignData).to.deep.equal(expectedSignData);
  });

  it('can create a user group', async () => {
    const builder = await makeTrustchainBuilder();

    const alice = await builder.addUserV3('alice');
    const aliceUser = generatorUserToUser(builder.generator.trustchainId, alice.user);
    const aliceUserKeyPair = alice.user.userKeys;
    if (!aliceUserKeyPair)
      throw new Error('alice must have a key pair');

    const blockGenerator = await builder.getBlockGeneratorOfDevice(alice.device);

    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();
    const groupEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();

    const block = blockGenerator.createUserGroup(
      groupSignatureKeyPair,
      groupEncryptionKeyPair,
      [aliceUser]
    );

    const entry = blockToEntry(block);
    const record: UserGroupCreationRecord = (entry.payload_unverified: any);
    expect(record.public_signature_key).to.deep.equal(groupSignatureKeyPair.publicKey);
    expect(record.public_encryption_key).to.deep.equal(groupEncryptionKeyPair.publicKey);
    expect(tcrypto.sealDecrypt(record.encrypted_group_private_signature_key, groupEncryptionKeyPair)).to.deep.equal(groupSignatureKeyPair.privateKey);
    expect(record.encrypted_group_private_encryption_keys_for_users.length).to.deep.equal(1);
    expect(record.encrypted_group_private_encryption_keys_for_users[0].public_user_encryption_key).to.deep.equal(aliceUserKeyPair.publicKey);
    expect(tcrypto.sealDecrypt(record.encrypted_group_private_encryption_keys_for_users[0].encrypted_group_private_encryption_key, aliceUserKeyPair)).to.deep.equal(groupEncryptionKeyPair.privateKey);
    const signData = getUserGroupCreationBlockSignData(record);
    expect(tcrypto.verifySignature(signData, record.self_signature, groupSignatureKeyPair.publicKey)).to.equal(true);
  });

  it('order stuff correctly for UserGroupAddition sign data', async () => {
    const record = {
      group_id: makeBuffer('group id', tcrypto.HASH_SIZE),
      previous_group_block: makeBuffer('prev group block', tcrypto.HASH_SIZE),
      encrypted_group_private_encryption_keys_for_users: [
        {
          public_user_encryption_key: makeBuffer('user pub enc key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeBuffer('enc group priv enc key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        },
        {
          public_user_encryption_key: makeBuffer('user pub enc key 2', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeBuffer('enc group priv enc key 2', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        }],
      self_signature_with_current_key: new Uint8Array(0),
    };

    const expectedSignData = concatArrays(
      record.group_id,
      record.previous_group_block,
      record.encrypted_group_private_encryption_keys_for_users[0].public_user_encryption_key,
      record.encrypted_group_private_encryption_keys_for_users[0].encrypted_group_private_encryption_key,
      record.encrypted_group_private_encryption_keys_for_users[1].public_user_encryption_key,
      record.encrypted_group_private_encryption_keys_for_users[1].encrypted_group_private_encryption_key,
    );

    const gotSignData = getUserGroupAdditionBlockSignData(record);

    expect(gotSignData).to.deep.equal(expectedSignData);
  });

  it('can add a user to a group', async () => {
    const builder = await makeTrustchainBuilder();

    const alice = await builder.addUserV3('alice');
    const aliceUser = generatorUserToUser(builder.generator.trustchainId, alice.user);
    const aliceUserKeyPair = alice.user.userKeys;
    if (!aliceUserKeyPair)
      throw new Error('alice must have a key pair');

    const blockGenerator = await builder.getBlockGeneratorOfDevice(alice.device);

    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();
    const groupEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const previousGroupBlock = makeBuffer('prev block', tcrypto.HASH_SIZE);

    const block = blockGenerator.addToUserGroup(
      groupSignatureKeyPair.publicKey,
      groupSignatureKeyPair.privateKey,
      previousGroupBlock,
      groupEncryptionKeyPair.privateKey,
      [aliceUser]
    );

    const entry = blockToEntry(block);
    const record: UserGroupAdditionRecord = (entry.payload_unverified: any);
    expect(record.group_id).to.deep.equal(groupSignatureKeyPair.publicKey);
    expect(record.previous_group_block).to.deep.equal(previousGroupBlock);
    expect(record.encrypted_group_private_encryption_keys_for_users.length).to.deep.equal(1);
    expect(record.encrypted_group_private_encryption_keys_for_users[0].public_user_encryption_key).to.deep.equal(aliceUserKeyPair.publicKey);
    expect(tcrypto.sealDecrypt(record.encrypted_group_private_encryption_keys_for_users[0].encrypted_group_private_encryption_key, aliceUserKeyPair)).to.deep.equal(groupEncryptionKeyPair.privateKey);
    const signData = getUserGroupAdditionBlockSignData(record);
    expect(tcrypto.verifySignature(signData, record.self_signature_with_current_key, groupSignatureKeyPair.publicKey)).to.equal(true);
  });
});
