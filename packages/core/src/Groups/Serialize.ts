import type { b64string } from '@tanker/crypto';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type { PublicProvisionalUser } from '../Identity';
import { getStaticArray, unserializeGeneric, unserializeGenericSub, unserializeList, encodeListLength, encodeUint32 } from '../Blocks/Serialize';
import { unserializeBlock } from '../Blocks/payloads';
import type { VerificationFields } from '../Blocks/Block';
import { hashBlock } from '../Blocks/Block';
import { preferredNature, NATURE_KIND, NATURE } from '../Blocks/Nature';

import type { User } from '../Users/types';
import { getLastUserPublicKey } from '../Users/types';

type GroupEncryptedKeyV1 = {
  public_user_encryption_key: Uint8Array;
  encrypted_group_private_encryption_key: Uint8Array;
};
type GroupEncryptedKeyV2 = {
  user_id: Uint8Array;
  public_user_encryption_key: Uint8Array;
  encrypted_group_private_encryption_key: Uint8Array;
};

export type ProvisionalGroupEncryptedKeyV2 = {
  app_provisional_user_public_signature_key: Uint8Array;
  tanker_provisional_user_public_signature_key: Uint8Array;
  encrypted_group_private_encryption_key: Uint8Array;
};

export type ProvisionalGroupEncryptedKeyV3 = {
  app_provisional_user_public_signature_key: Uint8Array;
  tanker_provisional_user_public_signature_key: Uint8Array;
  app_provisional_user_public_encryption_key: Uint8Array;
  tanker_provisional_user_public_encryption_key: Uint8Array;
  encrypted_group_private_encryption_key: Uint8Array;
};

export type UserGroupCreationRecordV1 = {
  public_encryption_key: Uint8Array;
  public_signature_key: Uint8Array;
  encrypted_group_private_signature_key: Uint8Array;
  encrypted_group_private_encryption_keys_for_users: ReadonlyArray<GroupEncryptedKeyV1>;
  self_signature: Uint8Array;
};

export type UserGroupCreationRecordV2 = {
  public_encryption_key: Uint8Array;
  public_signature_key: Uint8Array;
  encrypted_group_private_signature_key: Uint8Array;
  encrypted_group_private_encryption_keys_for_users: ReadonlyArray<GroupEncryptedKeyV2>;
  encrypted_group_private_encryption_keys_for_provisional_users: ReadonlyArray<ProvisionalGroupEncryptedKeyV2>;
  self_signature: Uint8Array;
};

export type UserGroupCreationRecordV3 = {
  public_encryption_key: Uint8Array;
  public_signature_key: Uint8Array;
  encrypted_group_private_signature_key: Uint8Array;
  encrypted_group_private_encryption_keys_for_users: ReadonlyArray<GroupEncryptedKeyV2>;
  encrypted_group_private_encryption_keys_for_provisional_users: ReadonlyArray<ProvisionalGroupEncryptedKeyV3>;
  self_signature: Uint8Array;
};

export type UserGroupAdditionRecordV1 = {
  group_id: Uint8Array;
  previous_group_block: Uint8Array;
  encrypted_group_private_encryption_keys_for_users: ReadonlyArray<GroupEncryptedKeyV1>;
  self_signature_with_current_key: Uint8Array;
};

export type UserGroupAdditionRecordV2 = {
  group_id: Uint8Array;
  previous_group_block: Uint8Array;
  encrypted_group_private_encryption_keys_for_users: ReadonlyArray<GroupEncryptedKeyV2>;
  encrypted_group_private_encryption_keys_for_provisional_users: ReadonlyArray<ProvisionalGroupEncryptedKeyV2>;
  self_signature_with_current_key: Uint8Array;
};

export type UserGroupAdditionRecordV3 = {
  group_id: Uint8Array;
  previous_group_block: Uint8Array;
  encrypted_group_private_encryption_keys_for_users: ReadonlyArray<GroupEncryptedKeyV2>;
  encrypted_group_private_encryption_keys_for_provisional_users: ReadonlyArray<ProvisionalGroupEncryptedKeyV3>;
  self_signature_with_current_key: Uint8Array;
};

export type GroupEncryptedKey = GroupEncryptedKeyV1 | GroupEncryptedKeyV2;

// Note: We can't define all those generic types as unions, because unions + spreads *badly* confuse flow. So just manually tell it what the fields are...
export type UserGroupCreationRecord = {
  public_encryption_key: Uint8Array;
  public_signature_key: Uint8Array;
  encrypted_group_private_signature_key: Uint8Array;
  encrypted_group_private_encryption_keys_for_users: ReadonlyArray<GroupEncryptedKey>;
  encrypted_group_private_encryption_keys_for_provisional_users?: ReadonlyArray<ProvisionalGroupEncryptedKeyV2 | ProvisionalGroupEncryptedKeyV3>;
  self_signature: Uint8Array;
};

export type UserGroupAdditionRecord = {
  group_id: Uint8Array;
  previous_group_block: Uint8Array;
  encrypted_group_private_encryption_keys_for_users: ReadonlyArray<GroupEncryptedKey>;
  encrypted_group_private_encryption_keys_for_provisional_users?: ReadonlyArray<ProvisionalGroupEncryptedKeyV2 | ProvisionalGroupEncryptedKeyV3>;
  self_signature_with_current_key: Uint8Array;
};
type ProvisionalUserId = {
  app_signature_public_key: Uint8Array;
  tanker_signature_public_key: Uint8Array;
};

export type UserGroupRemovalRecord = {
  group_id: Uint8Array;
  members_to_remove: ReadonlyArray<Uint8Array>;
  provisional_members_to_remove: ReadonlyArray<ProvisionalUserId>;
  self_signature_with_current_key: Uint8Array;
};
type UserGroupCreationEntry = UserGroupCreationRecord & VerificationFields;
type UserGroupAdditionEntry = UserGroupAdditionRecord & VerificationFields;

export type UserGroupEntry = UserGroupCreationEntry | UserGroupAdditionEntry;

export function isGroupAddition(entry: UserGroupEntry): entry is UserGroupAdditionEntry {
  return !('public_encryption_key' in entry);
}

function serializeGroupEncryptedKeyV1(gek: GroupEncryptedKeyV1): Uint8Array {
  return utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key);
}

function serializeGroupEncryptedKeyV2(gek: GroupEncryptedKeyV2): Uint8Array {
  return utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key,
  );
}

function serializeProvisionalGroupEncryptedKeyV2(gek: ProvisionalGroupEncryptedKeyV2): Uint8Array {
  return utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.encrypted_group_private_encryption_key,
  );
}

function serializeProvisionalGroupEncryptedKeyV3(gek: ProvisionalGroupEncryptedKeyV3): Uint8Array {
  return utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.app_provisional_user_public_encryption_key,
    gek.tanker_provisional_user_public_encryption_key,
    gek.encrypted_group_private_encryption_key,
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
  if (userGroupAddition.group_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group id size');
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
  if (userGroupAddition.group_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group id size');
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
  if (userGroupAddition.group_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group id size');
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

function checkGroupMemberToRemove(blockType: string, member: Uint8Array): void {
  if (member.length !== tcrypto.HASH_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} member to remove user ID size`);
}

function checkGroupProvisionalMemberToRemove(blockType: string, member: ProvisionalUserId): void {
  if (member.app_signature_public_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} provisional member to remove app signature public key size`);
  if (member.tanker_signature_public_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError(`Assertion error: invalid ${blockType} provisional member to remove tanker signature public key size`);
}

export function serializeUserGroupRemoval(userGroupRemoval: UserGroupRemovalRecord): Uint8Array {
  if (userGroupRemoval.group_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user group removal group id size');
  for (const k of userGroupRemoval.members_to_remove)
    checkGroupMemberToRemove('user group removal', k);
  for (const k of userGroupRemoval.provisional_members_to_remove)
    checkGroupProvisionalMemberToRemove('user group removal', k);
  if (userGroupRemoval.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user group addition group self signature size');

  return utils.concatArrays(
    userGroupRemoval.group_id,
    encodeListLength(userGroupRemoval.members_to_remove),
    ...userGroupRemoval.members_to_remove,
    encodeListLength(userGroupRemoval.provisional_members_to_remove),
    ...userGroupRemoval.provisional_members_to_remove.map(member => utils.concatArrays(member.app_signature_public_key, member.tanker_signature_public_key)),
    userGroupRemoval.self_signature_with_current_key,
  );
}

function unserializeProvisionalUserId(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'app_signature_public_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'tanker_signature_public_key'),
  ], offset);
}

export function unserializeUserGroupRemoval(src: Uint8Array): UserGroupRemovalRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'group_id'),
    (d, o) => unserializeList(d, (dd, oo) => getStaticArray(dd, tcrypto.HASH_SIZE, oo, 'value'), o, 'members_to_remove'),
    (d, o) => unserializeList(d, unserializeProvisionalUserId, o, 'provisional_members_to_remove'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'self_signature_with_current_key'),
  ]);
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

  throw new InternalError(`Assertion error: wrong type for getGroupEntryFromBlock: ${nature}`);
}

export const getUserGroupCreationBlockSignDataV1 = (record: UserGroupCreationRecordV1): Uint8Array => utils.concatArrays(
  record.public_signature_key,
  record.public_encryption_key,
  record.encrypted_group_private_signature_key,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key)),
);

export const getUserGroupCreationBlockSignDataV2 = (record: UserGroupCreationRecordV2): Uint8Array => utils.concatArrays(
  record.public_signature_key,
  record.public_encryption_key,
  record.encrypted_group_private_signature_key,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key,
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.encrypted_group_private_encryption_key,
  )),
);

export const getUserGroupCreationBlockSignDataV3 = (record: UserGroupCreationRecordV3): Uint8Array => utils.concatArrays(
  record.public_signature_key,
  record.public_encryption_key,
  record.encrypted_group_private_signature_key,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key,
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.app_provisional_user_public_encryption_key,
    gek.tanker_provisional_user_public_encryption_key,
    gek.encrypted_group_private_encryption_key,
  )),
);

export const getUserGroupAdditionBlockSignDataV1 = (record: UserGroupAdditionRecordV1): Uint8Array => utils.concatArrays(
  record.group_id,
  record.previous_group_block,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key,
  )),
);

export const getUserGroupAdditionBlockSignDataV2 = (record: UserGroupAdditionRecordV2): Uint8Array => utils.concatArrays(
  record.group_id,
  record.previous_group_block,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key,
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.encrypted_group_private_encryption_key,
  )),
);

export const getUserGroupAdditionBlockSignDataV3 = (record: UserGroupAdditionRecordV3): Uint8Array => utils.concatArrays(
  record.group_id,
  record.previous_group_block,
  ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
    gek.user_id,
    gek.public_user_encryption_key,
    gek.encrypted_group_private_encryption_key,
  )),
  ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
    gek.app_provisional_user_public_signature_key,
    gek.tanker_provisional_user_public_signature_key,
    gek.app_provisional_user_public_encryption_key,
    gek.tanker_provisional_user_public_encryption_key,
    gek.encrypted_group_private_encryption_key,
  )),
);

const userGroupRemovalSignaturePrefix = utils.fromString('UserGroupRemoval Signature');

export const getUserGroupRemovalBlockSignData = (record: UserGroupRemovalRecord, authorId: Uint8Array): Uint8Array => utils.concatArrays(
  userGroupRemovalSignaturePrefix,
  authorId,
  record.group_id,
  encodeUint32(record.members_to_remove.length),
  ...record.members_to_remove,
  encodeUint32(record.provisional_members_to_remove.length),
  ...record.provisional_members_to_remove.map(m => utils.concatArrays(m.app_signature_public_key, m.tanker_signature_public_key)),
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
    const encryptedKey = tcrypto.sealEncrypt(preEncryptedKey, u.tankerEncryptionPublicKey);
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

export const makeUserGroupRemoval = (author: Uint8Array, groupId: Uint8Array, privateSignatureKey: Uint8Array, users: Array<Uint8Array>, provisionalUsers: Array<PublicProvisionalUser>) => {
  const provisionalMembers = provisionalUsers.map(u => ({
    app_signature_public_key: u.appSignaturePublicKey,
    tanker_signature_public_key: u.tankerSignaturePublicKey,
  }));

  const payload = {
    group_id: groupId,
    members_to_remove: users,
    provisional_members_to_remove: provisionalMembers,
    self_signature_with_current_key: new Uint8Array(0),
  };

  const signData = getUserGroupRemovalBlockSignData(payload, author);
  payload.self_signature_with_current_key = tcrypto.sign(signData, privateSignatureKey);

  return { payload: serializeUserGroupRemoval(payload), nature: NATURE.user_group_removal };
};
