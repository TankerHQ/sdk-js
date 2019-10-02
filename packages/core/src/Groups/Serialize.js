// @flow
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { getStaticArray, unserializeGeneric, unserializeGenericSub, unserializeList, encodeListLength } from '../Blocks/Serialize';

export const SEALED_KEY_SIZE = tcrypto.SYMMETRIC_KEY_SIZE + tcrypto.SEAL_OVERHEAD;
export const TWO_TIMES_SEALED_KEY_SIZE = SEALED_KEY_SIZE + tcrypto.SEAL_OVERHEAD;

export const groupNatures = Object.freeze({
  user_group_creation_v1: 10,
  user_group_addition_v1: 12,
  user_group_creation_v2: 15,
  user_group_addition_v2: 16,
});

export type GroupEncryptedKeyV1 = {|
    public_user_encryption_key: Uint8Array,
    encrypted_group_private_encryption_key: Uint8Array,
  |}

export type GroupEncryptedKeyV2 = {|
    user_id: Uint8Array,
    public_user_encryption_key: Uint8Array,
    encrypted_group_private_encryption_key: Uint8Array,
  |}

export type ProvisionalGroupEncryptedKeyV2 = {|
    app_provisional_user_public_signature_key: Uint8Array,
    tanker_provisional_user_public_signature_key: Uint8Array,
    encrypted_group_private_encryption_key: Uint8Array,
  |}


export type UserGroupCreationRecordV1 = {|
    public_encryption_key: Uint8Array,
    public_signature_key: Uint8Array,
    encrypted_group_private_signature_key: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV1>,
    self_signature: Uint8Array,
  |}

export type UserGroupCreationRecordV2 = {|
    public_encryption_key: Uint8Array,
    public_signature_key: Uint8Array,
    encrypted_group_private_signature_key: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV2>,
    encrypted_group_private_encryption_keys_for_provisional_users: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2>,
    self_signature: Uint8Array,
  |}

export type UserGroupAdditionRecordV1 = {|
    group_id: Uint8Array,
    previous_group_block: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV1>,
    self_signature_with_current_key: Uint8Array,
  |}

export type UserGroupAdditionRecordV2 = {|
    group_id: Uint8Array,
    previous_group_block: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKeyV2>,
    encrypted_group_private_encryption_keys_for_provisional_users: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2>,
    self_signature_with_current_key: Uint8Array,
  |}

export type GroupEncryptedKey = GroupEncryptedKeyV1 | GroupEncryptedKeyV2;

// Note: We can't define all those generic types as unions, because unions + spreads *badly* confuse flow. So just manually tell it what the fields are...
export type UserGroupCreationRecord = {|
    public_encryption_key: Uint8Array,
    public_signature_key: Uint8Array,
    encrypted_group_private_signature_key: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKey>,
    encrypted_group_private_encryption_keys_for_provisional_users?: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2>,
    self_signature: Uint8Array,
  |};

export type UserGroupAdditionRecord = {|
    group_id: Uint8Array,
    previous_group_block: Uint8Array,
    encrypted_group_private_encryption_keys_for_users: $ReadOnlyArray<GroupEncryptedKey>,
    encrypted_group_private_encryption_keys_for_provisional_users?: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2>,
    self_signature_with_current_key: Uint8Array,
  |};

export type UserGroupRecord = UserGroupCreationRecord | UserGroupAdditionRecord;

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
    (d, o) => getStaticArray(d, TWO_TIMES_SEALED_KEY_SIZE, o, 'encrypted_group_private_encryption_key'),
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
  if (key.encrypted_group_private_encryption_key.length !== TWO_TIMES_SEALED_KEY_SIZE)
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
    ...userGroupCreation.encrypted_group_private_encryption_keys_for_users.map(serializeGroupEncryptedKeyV1),
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
    ...userGroupCreation.encrypted_group_private_encryption_keys_for_users.map(serializeGroupEncryptedKeyV2),
    encodeListLength(userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users),
    ...userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users.map(serializeProvisionalGroupEncryptedKeyV2),
    userGroupCreation.self_signature,
  );
}

export function serializeUserGroupAdditionV1(userGroupAddition: UserGroupAdditionRecordV1): Uint8Array {
  if (userGroupAddition.previous_group_block.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group addition previous group block size');
  userGroupAddition.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV1('user group add V1', k));
  if (userGroupAddition.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group self signature size');

  return utils.concatArrays(
    userGroupAddition.group_id,
    userGroupAddition.previous_group_block,
    encodeListLength(userGroupAddition.encrypted_group_private_encryption_keys_for_users),
    ...userGroupAddition.encrypted_group_private_encryption_keys_for_users.map(serializeGroupEncryptedKeyV1),
    userGroupAddition.self_signature_with_current_key,
  );
}

export function serializeUserGroupAdditionV2(userGroupAddition: UserGroupAdditionRecordV2): Uint8Array {
  if (userGroupAddition.previous_group_block.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group addition previous group block size');
  userGroupAddition.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV2('user group add V2', k));
  userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users.forEach(k => checkProvisionalGroupEncryptedKeyV2('user group creation V2', k));
  if (userGroupAddition.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group self signature size');

  return utils.concatArrays(
    userGroupAddition.group_id,
    userGroupAddition.previous_group_block,
    encodeListLength(userGroupAddition.encrypted_group_private_encryption_keys_for_users),
    ...userGroupAddition.encrypted_group_private_encryption_keys_for_users.map(serializeGroupEncryptedKeyV2),
    encodeListLength(userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users),
    ...userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users.map(serializeProvisionalGroupEncryptedKeyV2),
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
