// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import type { PublicProvisionalUser, PublicPermanentIdentity, PublicProvisionalIdentity } from '@tanker/identity';

import { getStaticArray, unserializeGeneric, unserializeGenericSub, unserializeList, encodeListLength } from '../Blocks/Serialize';
import { unserializeBlock } from '../Blocks/payloads';
import { type VerificationFields, hashBlock } from '../Blocks/Block';
import { preferredNature, NATURE_KIND, NATURE } from '../Blocks/Nature';

import { getLastUserPublicKey, type User } from '../Users/types';

type GroupEncryptedKeyV1 = {|
    public_user_encryption_key: Uint8Array,
    encrypted_group_private_encryption_key: Uint8Array,
  |};

type GroupEncryptedKeyV2 = {|
    user_id: Uint8Array,
    public_user_encryption_key: Uint8Array,
    encrypted_group_private_encryption_key: Uint8Array,
  |};

export type ProvisionalGroupEncryptedKeyV2 = {|
    app_provisional_user_public_signature_key: Uint8Array,
    tanker_provisional_user_public_signature_key: Uint8Array,
    encrypted_group_private_encryption_key: Uint8Array,
  |};

export type ProvisionalGroupEncryptedKeyV3 = {|
    app_provisional_user_public_signature_key: Uint8Array,
    tanker_provisional_user_public_signature_key: Uint8Array,
    app_provisional_user_public_encryption_key: Uint8Array,
    tanker_provisional_user_public_encryption_key: Uint8Array,
    encrypted_group_private_encryption_key: Uint8Array,
  |};

export type UserGroupCreationRecordV1 = {|
    public_encryption_key: Uint8Array,
    public_signature_key: Uint8Array,
    encrypted_group_private_signature_key: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV1>,
    self_signature: Uint8Array,
  |};

export type UserGroupCreationRecordV2 = {|
    public_encryption_key: Uint8Array,
    public_signature_key: Uint8Array,
    encrypted_group_private_signature_key: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV2>,
    encrypted_group_private_encryption_keys_for_provisional_users: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2>,
    self_signature: Uint8Array,
  |};

export type UserGroupCreationRecordV3 = {|
    public_encryption_key: Uint8Array,
    public_signature_key: Uint8Array,
    encrypted_group_private_signature_key: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV2>,
    encrypted_group_private_encryption_keys_for_provisional_users: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV3>,
    self_signature: Uint8Array,
  |};

export type UserGroupAdditionRecordV1 = {|
    group_id: Uint8Array,
    previous_group_block: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV1>,
    self_signature_with_current_key: Uint8Array,
  |};

export type UserGroupAdditionRecordV2 = {|
    group_id: Uint8Array,
    previous_group_block: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV2>,
    encrypted_group_private_encryption_keys_for_provisional_users: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2>,
    self_signature_with_current_key: Uint8Array,
  |};

export type UserGroupAdditionRecordV3 = {|
    group_id: Uint8Array,
    previous_group_block: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV2>,
    encrypted_group_private_encryption_keys_for_provisional_users: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV3>,
    self_signature_with_current_key: Uint8Array,
  |};

export type GroupEncryptedKey = GroupEncryptedKeyV1 | GroupEncryptedKeyV2;

// Note: We can't define all those generic types as unions, because unions + spreads *badly* confuse flow. So just manually tell it what the fields are...
export type UserGroupCreationRecord = {|
    public_encryption_key: Uint8Array,
    public_signature_key: Uint8Array,
    encrypted_group_private_signature_key: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKey>,
    encrypted_group_private_encryption_keys_for_provisional_users?: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2 | ProvisionalGroupEncryptedKeyV3>,
    self_signature: Uint8Array,
  |};

export type UserGroupAdditionRecord = {|
    group_id: Uint8Array,
    previous_group_block: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKey>,
    encrypted_group_private_encryption_keys_for_provisional_users?: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2 | ProvisionalGroupEncryptedKeyV3>,
    self_signature_with_current_key: Uint8Array,
  |};

export type UserGroupUpdateRecord = {|
    group_id: Uint8Array,
    previous_group_block: Uint8Array,
    previous_key_rotation_block: Uint8Array,
    public_encryption_key: Uint8Array,
    public_signature_key: Uint8Array,
    encrypted_group_private_signature_key: Uint8Array,
    encrypted_previous_group_private_encryption_key: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV2>,
    encrypted_group_private_encryption_keys_for_provisional_users: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV3>,
    self_signature_with_current_key: Uint8Array,
    self_signature_with_previous_key: Uint8Array,
  |};

type UserGroupCreationEntry = {|
  ...UserGroupCreationRecord,
  ...VerificationFields
|};

type UserGroupAdditionEntry = {|
  ...UserGroupAdditionRecord,
  ...VerificationFields
|};

type UserGroupUpdateEntry = {|
  ...UserGroupUpdateRecord,
  ...VerificationFields
|};

export type UserGroupEntry = UserGroupCreationEntry | UserGroupAdditionEntry | UserGroupUpdateEntry;

export function isGroupAddition(entry: UserGroupEntry): %checks {
  return !entry.public_encryption_key;
}

export function isGroupUpdate(entry: UserGroupEntry): %checks {
  return !!entry.encrypted_previous_group_private_encryption_key;
}

function serializeGroupEncryptedKeyV1(gek: GroupEncryptedKeyV1): Uint8Array {
  return utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key);
}

function serializeGroupEncryptedKeyV2(gek: GroupEncryptedKeyV2): Uint8Array {
  return utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key
  );
}

function serializeProvisionalGroupEncryptedKeyV2(gek: ProvisionalGroupEncryptedKeyV2): Uint8Array {
  return utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.encrypted_group_private_encryption_key
  );
}

function serializeProvisionalGroupEncryptedKeyV3(gek: ProvisionalGroupEncryptedKeyV3): Uint8Array {
  return utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.app_provisional_user_public_encryption_key,
    gek.tanker_provisional_user_public_encryption_key,
    gek.encrypted_group_private_encryption_key
  );
}

function unserializeGroupEncryptedKeyV1(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_user_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE, o, 'encrypted_group_private_encryption_key'),
  ], offset);
}

function unserializeGroupEncryptedKeyV2(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_user_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE, o, 'encrypted_group_private_encryption_key'),
  ], offset);
}

function unserializeProvisionalGroupEncryptedKeyV2(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'app_provisional_user_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'tanker_provisional_user_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.TWO_TIMES_SEALED_KEY_SIZE, o, 'encrypted_group_private_encryption_key'),
  ], offset);
}

function unserializeProvisionalGroupEncryptedKeyV3(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'app_provisional_user_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'tanker_provisional_user_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'app_provisional_user_public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'tanker_provisional_user_public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.TWO_TIMES_SEALED_KEY_SIZE, o, 'encrypted_group_private_encryption_key'),
  ], offset);
}

export function unserializeUserGroupCreationV2(src: Uint8Array): UserGroupCreationRecordV2 {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE, o, 'encrypted_group_private_signature_key'),
    (d, o) => unserializeList(d, unserializeGroupEncryptedKeyV2, o, 'encrypted_group_private_encryption_keys_for_users'),
    (d, o) => unserializeList(d, unserializeProvisionalGroupEncryptedKeyV2, o, 'encrypted_group_private_encryption_keys_for_provisional_users'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature'),
  ]);
}

export function unserializeUserGroupCreationV3(src: Uint8Array): UserGroupCreationRecordV3 {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE, o, 'encrypted_group_private_signature_key'),
    (d, o) => unserializeList(d, unserializeGroupEncryptedKeyV2, o, 'encrypted_group_private_encryption_keys_for_users'),
    (d, o) => unserializeList(d, unserializeProvisionalGroupEncryptedKeyV3, o, 'encrypted_group_private_encryption_keys_for_provisional_users'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature'),
  ]);
}

function checkGroupEncryptedKeyV1(blockType: string, key: GroupEncryptedKeyV1): void {
  if (key.public_user_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} recipient user public key size`);
  if (key.encrypted_group_private_encryption_key.length !== tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} encrypted group private encryption key size`);
}

function checkGroupEncryptedKeyV2(blockType: string, key: GroupEncryptedKeyV2): void {
  if (key.user_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} recipient user id size`);
  if (key.public_user_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} recipient user public key size`);
  if (key.encrypted_group_private_encryption_key.length !== tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} encrypted group private encryption key size`);
}

function checkProvisionalGroupEncryptedKeyV2(blockType: string, key: ProvisionalGroupEncryptedKeyV2): void {
  if (key.app_provisional_user_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} app signature public key size`);
  if (key.tanker_provisional_user_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} tanker signature public key size`);
  if (key.encrypted_group_private_encryption_key.length !== tcrypto.TWO_TIMES_SEALED_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} encrypted group private encryption key size`);
}

function checkProvisionalGroupEncryptedKeyV3(blockType: string, key: ProvisionalGroupEncryptedKeyV3): void {
  if (key.app_provisional_user_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} app signature public key size`);
  if (key.tanker_provisional_user_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} tanker signature public key size`);
  if (key.app_provisional_user_public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} app encryption public key size`);
  if (key.tanker_provisional_user_public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} tanker encryption public key size`);
  if (key.encrypted_group_private_encryption_key.length !== tcrypto.TWO_TIMES_SEALED_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} encrypted group private encryption key size`);
}

export function serializeUserGroupCreationV1(userGroupCreation: UserGroupCreationRecordV1): Uint8Array {
  if (userGroupCreation.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group public signature key size');
  if (userGroupCreation.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group public encryption key size');
  if (userGroupCreation.encrypted_group_private_signature_key.length !== tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation encrypted group private signature key size');
  userGroupCreation.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV1('user group creation V1', k));
  if (userGroupCreation.self_signature.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group self signature size');

  return utils.concatArrays(
    userGroupCreation.public_signature_key,
    userGroupCreation.public_encryption_key,
    userGroupCreation.encrypted_group_private_signature_key,
    encodeListLength(userGroupCreation.encrypted_group_private_encryption_keys_for_users),
    ...userGroupCreation.encrypted_group_private_encryption_keys_for_users.map(key => serializeGroupEncryptedKeyV1(key)),
    userGroupCreation.self_signature,
  );
}

export function unserializeUserGroupCreationV1(src: Uint8Array): UserGroupCreationRecordV1 {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE, o, 'encrypted_group_private_signature_key'),
    (d, o) => unserializeList(d, unserializeGroupEncryptedKeyV1, o, 'encrypted_group_private_encryption_keys_for_users'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature'),
  ]);
}

export function serializeUserGroupCreationV2(userGroupCreation: UserGroupCreationRecordV2): Uint8Array {
  if (userGroupCreation.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group public signature key size');
  if (userGroupCreation.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group public encryption key size');
  if (userGroupCreation.encrypted_group_private_signature_key.length !== tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation encrypted group private signature key size');
  userGroupCreation.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV2('user group creation V2', k));
  userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users.forEach(k => checkProvisionalGroupEncryptedKeyV2('user group creation V2', k));
  if (userGroupCreation.self_signature.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group self signature size');

  return utils.concatArrays(
    userGroupCreation.public_signature_key,
    userGroupCreation.public_encryption_key,
    userGroupCreation.encrypted_group_private_signature_key,
    encodeListLength(userGroupCreation.encrypted_group_private_encryption_keys_for_users),
    ...userGroupCreation.encrypted_group_private_encryption_keys_for_users.map(key => serializeGroupEncryptedKeyV2(key)),
    encodeListLength(userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users),
    ...userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users.map(key => serializeProvisionalGroupEncryptedKeyV2(key)),
    userGroupCreation.self_signature,
  );
}

export function serializeUserGroupCreationV3(userGroupCreation: UserGroupCreationRecordV3): Uint8Array {
  if (userGroupCreation.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group public signature key size');
  if (userGroupCreation.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group public encryption key size');
  if (userGroupCreation.encrypted_group_private_signature_key.length !== tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user group creation encrypted group private signature key size');
  userGroupCreation.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV2('user group creation V3', k));
  userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users.forEach(k => checkProvisionalGroupEncryptedKeyV3('user group creation V3', k));
  if (userGroupCreation.self_signature.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group creation group self signature size');

  return utils.concatArrays(
    userGroupCreation.public_signature_key,
    userGroupCreation.public_encryption_key,
    userGroupCreation.encrypted_group_private_signature_key,
    encodeListLength(userGroupCreation.encrypted_group_private_encryption_keys_for_users),
    ...userGroupCreation.encrypted_group_private_encryption_keys_for_users.map(key => serializeGroupEncryptedKeyV2(key)),
    encodeListLength(userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users),
    ...userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users.map(key => serializeProvisionalGroupEncryptedKeyV3(key)),
    userGroupCreation.self_signature,
  );
}

export function serializeUserGroupAdditionV1(userGroupAddition: UserGroupAdditionRecordV1): Uint8Array {
  if (userGroupAddition.previous_group_block.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group addition previous group block size');
  userGroupAddition.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV1('user group addition V1', k));
  if (userGroupAddition.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group self signature size');

  return utils.concatArrays(
    userGroupAddition.group_id,
    userGroupAddition.previous_group_block,
    encodeListLength(userGroupAddition.encrypted_group_private_encryption_keys_for_users),
    ...userGroupAddition.encrypted_group_private_encryption_keys_for_users.map(key => serializeGroupEncryptedKeyV1(key)),
    userGroupAddition.self_signature_with_current_key,
  );
}

export function serializeUserGroupAdditionV2(userGroupAddition: UserGroupAdditionRecordV2): Uint8Array {
  if (userGroupAddition.previous_group_block.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group addition previous group block size');
  userGroupAddition.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV2('user group addition V2', k));
  userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users.forEach(k => checkProvisionalGroupEncryptedKeyV2('user group addition V2', k));
  if (userGroupAddition.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group self signature size');

  return utils.concatArrays(
    userGroupAddition.group_id,
    userGroupAddition.previous_group_block,
    encodeListLength(userGroupAddition.encrypted_group_private_encryption_keys_for_users),
    ...userGroupAddition.encrypted_group_private_encryption_keys_for_users.map(key => serializeGroupEncryptedKeyV2(key)),
    encodeListLength(userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users),
    ...userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users.map(key => serializeProvisionalGroupEncryptedKeyV2(key)),
    userGroupAddition.self_signature_with_current_key,
  );
}

export function serializeUserGroupAdditionV3(userGroupAddition: UserGroupAdditionRecordV3): Uint8Array {
  if (userGroupAddition.previous_group_block.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group addition previous group block size');
  userGroupAddition.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV2('user group addition V3', k));
  userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users.forEach(k => checkProvisionalGroupEncryptedKeyV3('user group addition V3', k));
  if (userGroupAddition.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group self signature size');

  return utils.concatArrays(
    userGroupAddition.group_id,
    userGroupAddition.previous_group_block,
    encodeListLength(userGroupAddition.encrypted_group_private_encryption_keys_for_users),
    ...userGroupAddition.encrypted_group_private_encryption_keys_for_users.map(key => serializeGroupEncryptedKeyV2(key)),
    encodeListLength(userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users),
    ...userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users.map(key => serializeProvisionalGroupEncryptedKeyV3(key)),
    userGroupAddition.self_signature_with_current_key,
  );
}

export function unserializeUserGroupAdditionV1(src: Uint8Array): UserGroupAdditionRecordV1 {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'group_id'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'previous_group_block'),
    (d, o) => unserializeList(d, unserializeGroupEncryptedKeyV1, o, 'encrypted_group_private_encryption_keys_for_users'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature_with_current_key'),
  ]);
}

export function unserializeUserGroupAdditionV2(src: Uint8Array): UserGroupAdditionRecordV2 {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'group_id'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'previous_group_block'),
    (d, o) => unserializeList(d, unserializeGroupEncryptedKeyV2, o, 'encrypted_group_private_encryption_keys_for_users'),
    (d, o) => unserializeList(d, unserializeProvisionalGroupEncryptedKeyV2, o, 'encrypted_group_private_encryption_keys_for_provisional_users'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature_with_current_key'),
  ]);
}

export function unserializeUserGroupAdditionV3(src: Uint8Array): UserGroupAdditionRecordV3 {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'group_id'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'previous_group_block'),
    (d, o) => unserializeList(d, unserializeGroupEncryptedKeyV2, o, 'encrypted_group_private_encryption_keys_for_users'),
    (d, o) => unserializeList(d, unserializeProvisionalGroupEncryptedKeyV3, o, 'encrypted_group_private_encryption_keys_for_provisional_users'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature_with_current_key'),
  ]);
}

export function serializeUserGroupUpdate(userGroupUpdate: UserGroupUpdateRecord): Uint8Array {
  if (userGroupUpdate.previous_group_block.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group update previous group block size');
  if (userGroupUpdate.previous_key_rotation_block.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group update previous key rotation block size');
  if (userGroupUpdate.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group update group self signature size');
  let provisionalUsers = [];
  if (userGroupUpdate.encrypted_group_private_encryption_keys_for_provisional_users) {
    provisionalUsers = userGroupUpdate.encrypted_group_private_encryption_keys_for_provisional_users;
  }
  userGroupUpdate.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV2('user group update', k));
  provisionalUsers.forEach(k => checkProvisionalGroupEncryptedKeyV3('user group update', k));
  return utils.concatArrays(
    userGroupUpdate.group_id,
    userGroupUpdate.previous_group_block,
    userGroupUpdate.previous_key_rotation_block,
    userGroupUpdate.public_signature_key,
    userGroupUpdate.public_encryption_key,
    userGroupUpdate.encrypted_group_private_signature_key,
    userGroupUpdate.encrypted_previous_group_private_encryption_key,
    encodeListLength(userGroupUpdate.encrypted_group_private_encryption_keys_for_users),
    ...userGroupUpdate.encrypted_group_private_encryption_keys_for_users.map(key => serializeGroupEncryptedKeyV2(key)),
    encodeListLength(provisionalUsers),
    ...provisionalUsers.map(key => serializeProvisionalGroupEncryptedKeyV3(key)),
    userGroupUpdate.self_signature_with_current_key,
    userGroupUpdate.self_signature_with_previous_key,
  );
}

export function unserializeUserGroupUpdate(src: Uint8Array): UserGroupUpdateRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'group_id'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'previous_group_block'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'previous_key_rotation_block'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE, o, 'encrypted_group_private_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE, o, 'encrypted_previous_group_private_encryption_key'),
    (d, o) => unserializeList(d, unserializeGroupEncryptedKeyV2, o, 'encrypted_group_private_encryption_keys_for_users'),
    (d, o) => unserializeList(d, unserializeProvisionalGroupEncryptedKeyV3, o, 'encrypted_group_private_encryption_keys_for_provisional_users'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature_with_current_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature_with_previous_key'),
  ]);
}

export function decryptPreviousGroupKey(userGroupUpdateEntry: UserGroupUpdateEntry, newKeyPair: tcrypto.SodiumKeyPair) {
  return tcrypto.getEncryptionKeyPairFromPrivateKey(
    tcrypto.sealDecrypt(userGroupUpdateEntry.encrypted_previous_group_private_encryption_key, newKeyPair)
  );
}

export function getGroupEntryFromBlock(b64Block: b64string): UserGroupEntry {
  const block = unserializeBlock(utils.fromBase64(b64Block));
  const author = block.author;
  const signature = block.signature;
  const nature = block.nature;
  const hash = hashBlock(block);

  if (block.nature === NATURE.user_group_creation_v1) {
    const userGroupAction = unserializeUserGroupCreationV1(block.payload);
    return { ...userGroupAction, author, signature, nature, hash };
  }
  if (block.nature === NATURE.user_group_creation_v2) {
    const userGroupAction = unserializeUserGroupCreationV2(block.payload);
    return { ...userGroupAction, author, signature, nature, hash };
  }
  if (block.nature === NATURE.user_group_creation_v3) {
    const userGroupAction = unserializeUserGroupCreationV3(block.payload);
    return { ...userGroupAction, author, signature, nature, hash };
  }
  if (block.nature === NATURE.user_group_addition_v1) {
    const userGroupAction = unserializeUserGroupAdditionV1(block.payload);
    return { ...userGroupAction, author, signature, nature, hash };
  }
  if (block.nature === NATURE.user_group_addition_v2) {
    const userGroupAction = unserializeUserGroupAdditionV2(block.payload);
    return { ...userGroupAction, author, signature, nature, hash };
  }
  if (block.nature === NATURE.user_group_addition_v3) {
    const userGroupAction = unserializeUserGroupAdditionV3(block.payload);
    return { ...userGroupAction, author, signature, nature, hash };
  }
  if (block.nature === NATURE.user_group_update) {
    const userGroupAction = unserializeUserGroupUpdate(block.payload);
    return { ...userGroupAction, author, signature, nature, hash };
  }

  throw new InternalError('Assertion error: wrong type for getGroupEntryFromBlock');
}

export const getUserGroupCreationBlockSignDataV1 = (record: UserGroupCreationRecordV1): Uint8Array => utils.concatArrays(
  record.public_signature_key,
  record.public_encryption_key,
  record.encrypted_group_private_signature_key,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key))
);

export const getUserGroupCreationBlockSignDataV2 = (record: UserGroupCreationRecordV2): Uint8Array => utils.concatArrays(
  record.public_signature_key,
  record.public_encryption_key,
  record.encrypted_group_private_signature_key,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.encrypted_group_private_encryption_key
  ))
);

export const getUserGroupCreationBlockSignDataV3 = (record: UserGroupCreationRecordV3): Uint8Array => utils.concatArrays(
  record.public_signature_key,
  record.public_encryption_key,
  record.encrypted_group_private_signature_key,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.app_provisional_user_public_encryption_key,
    gek.tanker_provisional_user_public_encryption_key,
    gek.encrypted_group_private_encryption_key
  ))
);

export const getUserGroupAdditionBlockSignDataV1 = (record: UserGroupAdditionRecordV1): Uint8Array => utils.concatArrays(
  record.group_id,
  record.previous_group_block,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key))
);

export const getUserGroupAdditionBlockSignDataV2 = (record: UserGroupAdditionRecordV2): Uint8Array => utils.concatArrays(
  record.group_id,
  record.previous_group_block,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.encrypted_group_private_encryption_key
  ))
);

export const getUserGroupAdditionBlockSignDataV3 = (record: UserGroupAdditionRecordV3): Uint8Array => utils.concatArrays(
  record.group_id,
  record.previous_group_block,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.app_provisional_user_public_encryption_key,
    gek.tanker_provisional_user_public_encryption_key,
    gek.encrypted_group_private_encryption_key
  ))
);

export const getUserGroupUpdateBlockSignData = (record: UserGroupUpdateRecord): Uint8Array => utils.concatArrays(
  record.group_id,
  record.previous_group_block,
  record.previous_key_rotation_block,
  record.public_signature_key,
  record.public_encryption_key,
  record.encrypted_group_private_signature_key,
  record.encrypted_previous_group_private_encryption_key,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.app_provisional_user_public_encryption_key,
    gek.tanker_provisional_user_public_encryption_key,
    gek.encrypted_group_private_encryption_key
  ))
);

export const makeUserGroupCreation = (signatureKeyPair: tcrypto.SodiumKeyPair, encryptionKeyPair: tcrypto.SodiumKeyPair, users: Array<User>, provisionalUsers: Array<PublicProvisionalUser>) => {
  const encryptedPrivateSignatureKey = tcrypto.sealEncrypt(signatureKeyPair.privateKey, encryptionKeyPair.publicKey);

  const keysForUsers = users.map(u => {
    const userPublicKey = getLastUserPublicKey(u);
    if (!userPublicKey)
      throw new InternalError('createUserGroup: user does not have user keys');
    return {
      user_id: u.userId,
      public_user_encryption_key: userPublicKey,
      encrypted_group_private_encryption_key: tcrypto.sealEncrypt(encryptionKeyPair.privateKey, userPublicKey),
    };
  });

  const keysForProvisionalUsers = provisionalUsers.map(u => {
    const preEncryptedKey = tcrypto.sealEncrypt(
      encryptionKeyPair.privateKey,
      u.appEncryptionPublicKey,
    );
    const encryptedKey = tcrypto.sealEncrypt(
      preEncryptedKey,
      u.tankerEncryptionPublicKey,
    );
    return {
      app_provisional_user_public_signature_key: u.appSignaturePublicKey,
      tanker_provisional_user_public_signature_key: u.tankerSignaturePublicKey,
      app_provisional_user_public_encryption_key: u.appEncryptionPublicKey,
      tanker_provisional_user_public_encryption_key: u.tankerEncryptionPublicKey,
      encrypted_group_private_encryption_key: encryptedKey,
    };
  });

  const payload = {
    public_signature_key: signatureKeyPair.publicKey,
    public_encryption_key: encryptionKeyPair.publicKey,
    encrypted_group_private_signature_key: encryptedPrivateSignatureKey,
    encrypted_group_private_encryption_keys_for_users: keysForUsers,
    encrypted_group_private_encryption_keys_for_provisional_users: keysForProvisionalUsers,
    self_signature: new Uint8Array(0),
  };

  const signData = getUserGroupCreationBlockSignDataV3(payload);
  payload.self_signature = tcrypto.sign(signData, signatureKeyPair.privateKey);

  return { payload: serializeUserGroupCreationV3(payload), nature: preferredNature(NATURE_KIND.user_group_creation) };
};

export const makeUserGroupAdditionV2 = (groupId: Uint8Array, privateSignatureKey: Uint8Array, previousGroupBlock: Uint8Array, privateEncryptionKey: Uint8Array, users: Array<User>, provisionalUsers: Array<PublicProvisionalUser>) => {
  const keysForUsers = users.map(u => {
    const userPublicKey = getLastUserPublicKey(u);
    if (!userPublicKey)
      throw new InternalError('addToUserGroup: user does not have user keys');
    return {
      user_id: u.userId,
      public_user_encryption_key: userPublicKey,
      encrypted_group_private_encryption_key: tcrypto.sealEncrypt(privateEncryptionKey, userPublicKey),
    };
  });

  const keysForProvisionalUsers = provisionalUsers.map(u => {
    const preEncryptedKey = tcrypto.sealEncrypt(
      privateEncryptionKey,
      u.appEncryptionPublicKey,
    );
    const encryptedKey = tcrypto.sealEncrypt(
      preEncryptedKey,
      u.tankerEncryptionPublicKey,
    );
    return {
      app_provisional_user_public_signature_key: u.appSignaturePublicKey,
      tanker_provisional_user_public_signature_key: u.tankerSignaturePublicKey,
      encrypted_group_private_encryption_key: encryptedKey,
    };
  });

  const payload = {
    group_id: groupId,
    previous_group_block: previousGroupBlock,
    encrypted_group_private_encryption_keys_for_users: keysForUsers,
    encrypted_group_private_encryption_keys_for_provisional_users: keysForProvisionalUsers,
    self_signature_with_current_key: new Uint8Array(0),
  };

  const signData = getUserGroupAdditionBlockSignDataV2(payload);
  payload.self_signature_with_current_key = tcrypto.sign(signData, privateSignatureKey);

  return { payload: serializeUserGroupAdditionV2(payload), nature: NATURE.user_group_addition_v2 };
};

export const makeUserGroupAdditionV3 = (groupId: Uint8Array, privateSignatureKey: Uint8Array, previousGroupBlock: Uint8Array, privateEncryptionKey: Uint8Array, users: Array<User>, provisionalUsers: Array<PublicProvisionalUser>) => {
  const keysForUsers = users.map(u => {
    const userPublicKey = getLastUserPublicKey(u);
    if (!userPublicKey)
      throw new InternalError('addToUserGroup: user does not have user keys');
    return {
      user_id: u.userId,
      public_user_encryption_key: userPublicKey,
      encrypted_group_private_encryption_key: tcrypto.sealEncrypt(privateEncryptionKey, userPublicKey),
    };
  });

  const keysForProvisionalUsers = provisionalUsers.map(u => {
    const preEncryptedKey = tcrypto.sealEncrypt(
      privateEncryptionKey,
      u.appEncryptionPublicKey,
    );
    const encryptedKey = tcrypto.sealEncrypt(
      preEncryptedKey,
      u.tankerEncryptionPublicKey,
    );
    return {
      app_provisional_user_public_signature_key: u.appSignaturePublicKey,
      tanker_provisional_user_public_signature_key: u.tankerSignaturePublicKey,
      app_provisional_user_public_encryption_key: u.appEncryptionPublicKey,
      tanker_provisional_user_public_encryption_key: u.tankerEncryptionPublicKey,
      encrypted_group_private_encryption_key: encryptedKey,
    };
  });

  const payload = {
    group_id: groupId,
    previous_group_block: previousGroupBlock,
    encrypted_group_private_encryption_keys_for_users: keysForUsers,
    encrypted_group_private_encryption_keys_for_provisional_users: keysForProvisionalUsers,
    self_signature_with_current_key: new Uint8Array(0),
  };

  const signData = getUserGroupAdditionBlockSignDataV3(payload);
  payload.self_signature_with_current_key = tcrypto.sign(signData, privateSignatureKey);

  return { payload: serializeUserGroupAdditionV3(payload), nature: NATURE.user_group_addition_v3 };
};

export const makeUserGroupUpdate = (
  groupId: Uint8Array,
  signatureKeyPair: tcrypto.SodiumKeyPair,
  encryptionKeyPair: tcrypto.SodiumKeyPair,
  previousGroupBlock: Uint8Array,
  previousKeyRotationBlock: Uint8Array,
  previousPrivateSignatureKey: Uint8Array,
  previousPrivateEncryptionKey: Uint8Array,
  usersInGroup: Array<User>,
  provisionalUsersInGroup?: Array<ProvisionalGroupEncryptedKeyV3>,
  usersToAdd?: Array<User>,
  provisionalUsersToAdd?: Array<PublicProvisionalUser>,
  usersToRemove?: Array<PublicPermanentIdentity>,
  provisionalUsersToRemove?: Array<PublicProvisionalIdentity>
) => {
  if (!usersToRemove && !provisionalUsersToRemove) {
    throw new InternalError('Assertion error: makeUserGroupUpdate: no users to remove');
  }

  const finalUsers = [];

  const userIdsToRemove = usersToRemove ? usersToRemove.map(userToRemove => utils.fromBase64(userToRemove.value)) : null;
  finalUsers.push(...usersInGroup.filter(userInGroup => {
    // Filter the users to remove
    if (userIdsToRemove) {
      return !utils.containArray(userIdsToRemove, userInGroup.userId);
    }
    return true;
  }));

  // Add the users from usersToAdd
  if (usersToAdd) {
    // Used to remove the duplicate users
    const b64FinalUserIds = new Set(...finalUsers.map(finalUser => utils.toBase64(finalUser.userId)));
    for (const userToAdd of usersToAdd) {
      const b64UserToAddId = utils.toBase64(userToAdd.userId);
      if (!b64FinalUserIds.has(b64UserToAddId)) {
        finalUsers.push(userToAdd);
        b64FinalUserIds.add(b64UserToAddId);
      }
    }
  }

  const keysForUsers = finalUsers.map(u => {
    const userPublicKey = getLastUserPublicKey(u);
    if (!userPublicKey)
      throw new InternalError('Assertion error: addToUserGroup: user does not have user keys');
    return {
      user_id: u.userId,
      public_user_encryption_key: userPublicKey,
      encrypted_group_private_encryption_key: tcrypto.sealEncrypt(encryptionKeyPair.privateKey, userPublicKey),
    };
  });

  const finalProvisionalUsers = [];
  const appSignaturePublicKeys = provisionalUsersToRemove ? provisionalUsersToRemove.map(provisionalUserToRemove => utils.fromBase64(provisionalUserToRemove.public_signature_key)) : null;

  // Add provisional users from block history, and filter the ones to remove
  if (provisionalUsersInGroup) {
    finalProvisionalUsers.push(...provisionalUsersInGroup.filter(provisionalUser => {
      if (appSignaturePublicKeys) {
        return !utils.containArray(appSignaturePublicKeys, provisionalUser.app_provisional_user_public_signature_key);
      }
      return true;
    }).map(provisionalUser => ({
      appEncryptionPublicKey: provisionalUser.app_provisional_user_public_encryption_key,
      appSignaturePublicKey: provisionalUser.app_provisional_user_public_signature_key,
      tankerEncryptionPublicKey: provisionalUser.tanker_provisional_user_public_encryption_key,
      tankerSignaturePublicKey: provisionalUser.tanker_provisional_user_public_signature_key,
    })));
  }

  // Add the new provisional users
  if (provisionalUsersToAdd) {
    finalProvisionalUsers.push(...provisionalUsersToAdd.map(provisionalUserToAdd => ({
      appEncryptionPublicKey: provisionalUserToAdd.appEncryptionPublicKey,
      appSignaturePublicKey: provisionalUserToAdd.appSignaturePublicKey,
      tankerEncryptionPublicKey: provisionalUserToAdd.tankerEncryptionPublicKey,
      tankerSignaturePublicKey: provisionalUserToAdd.tankerSignaturePublicKey,
    })));
  }

  const keysForProvisionalUsers = finalProvisionalUsers.map(u => {
    const preEncryptedKey = tcrypto.sealEncrypt(
      encryptionKeyPair.privateKey,
      u.appEncryptionPublicKey,
    );
    const encryptedKey = tcrypto.sealEncrypt(
      preEncryptedKey,
      u.tankerEncryptionPublicKey,
    );
    return {
      app_provisional_user_public_signature_key: u.appSignaturePublicKey,
      tanker_provisional_user_public_signature_key: u.tankerSignaturePublicKey,
      app_provisional_user_public_encryption_key: u.appEncryptionPublicKey,
      tanker_provisional_user_public_encryption_key: u.tankerEncryptionPublicKey,
      encrypted_group_private_encryption_key: encryptedKey,
    };
  });

  const payload = {
    group_id: groupId,
    previous_group_block: previousGroupBlock,
    previous_key_rotation_block: previousKeyRotationBlock,
    public_signature_key: signatureKeyPair.publicKey,
    public_encryption_key: encryptionKeyPair.publicKey,
    encrypted_group_private_signature_key: tcrypto.sealEncrypt(signatureKeyPair.privateKey, encryptionKeyPair.publicKey),
    encrypted_previous_group_private_encryption_key: tcrypto.sealEncrypt(previousPrivateEncryptionKey, encryptionKeyPair.publicKey),
    encrypted_group_private_encryption_keys_for_users: keysForUsers,
    encrypted_group_private_encryption_keys_for_provisional_users: keysForProvisionalUsers,
    self_signature_with_current_key: new Uint8Array(0),
    self_signature_with_previous_key: new Uint8Array(0),
  };

  const signData = getUserGroupUpdateBlockSignData(payload);
  payload.self_signature_with_current_key = tcrypto.sign(signData, signatureKeyPair.privateKey);
  payload.self_signature_with_previous_key = tcrypto.sign(signData, previousPrivateSignatureKey);

  return { payload: serializeUserGroupUpdate(payload), nature: preferredNature(NATURE_KIND.user_group_update) };
};
