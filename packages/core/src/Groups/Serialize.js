// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import { type PublicProvisionalUser } from '@tanker/identity';


import { getStaticArray, unserializeGeneric, unserializeGenericSub, unserializeList, encodeListLength } from '../Blocks/Serialize';
import { unserializeBlock } from '../Blocks/payloads';
import { type VerificationFields, hashBlock } from '../Blocks/Block';
import { preferredNature, NATURE_KIND, NATURE } from '../Blocks/Nature';

import { getLastUserPublicKey, type User } from '../Users/types';

type GroupEncryptedKeyV1 = {|
    public_user_encryption_key: Uint8Array,
    encrypted_group_private_encryption_key: Uint8Array,
  |}

type GroupEncryptedKeyV2 = {|
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

type UserGroupCreationEntry = {|
  ...UserGroupCreationRecord,
  ...VerificationFields
|};

type UserGroupAdditionEntry = {|
  ...UserGroupAdditionRecord,
  ...VerificationFields
|};

export type UserGroupEntry = UserGroupCreationEntry | UserGroupAdditionEntry;

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
  if (block.nature === NATURE.user_group_addition_v1) {
    const userGroupAction = unserializeUserGroupAdditionV1(block.payload);
    return { ...userGroupAction, author, signature, nature, hash };
  }
  if (block.nature === NATURE.user_group_addition_v2) {
    const userGroupAction = unserializeUserGroupAdditionV2(block.payload);
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

  const signData = getUserGroupCreationBlockSignDataV2(payload);
  payload.self_signature = tcrypto.sign(signData, signatureKeyPair.privateKey);

  return { payload: serializeUserGroupCreationV2(payload), nature: preferredNature(NATURE_KIND.user_group_creation) };
};

export const makeUserGroupAddition = (groupId: Uint8Array, privateSignatureKey: Uint8Array, previousGroupBlock: Uint8Array, privateEncryptionKey: Uint8Array, users: Array<User>, provisionalUsers: Array<PublicProvisionalUser>) => {
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

  return { payload: serializeUserGroupAdditionV2(payload), nature: preferredNature(NATURE_KIND.user_group_addition) };
};