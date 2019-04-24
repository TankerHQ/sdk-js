// @flow
import varint from 'varint';
import { tcrypto, utils } from '@tanker/crypto';

import { type Block } from './Block';
import { NATURE } from './Nature';
import { UpgradeRequiredError } from '../errors.internal';
import { getArray, getStaticArray, encodeArrayLength, encodeListLength, unserializeGenericSub, unserializeGeneric, unserializeList } from './Serialize';

export const SEALED_KEY_SIZE = tcrypto.SYMMETRIC_KEY_SIZE + tcrypto.SEAL_OVERHEAD;
export const TWO_TIMES_SEALED_KEY_SIZE = SEALED_KEY_SIZE + tcrypto.SEAL_OVERHEAD;

export type TrustchainCreationRecord = {|
  public_signature_key: Uint8Array,
|}

export type UserPrivateKey = {|
  recipient: Uint8Array,
  key: Uint8Array,
|}

export type UserKeyPair = {|
  public_encryption_key: Uint8Array,
  encrypted_private_encryption_key: Uint8Array,
|}

export type UserKeys = {|
  public_encryption_key: Uint8Array,
  previous_public_encryption_key: Uint8Array,
  encrypted_previous_encryption_key: Uint8Array,
  private_keys: Array<UserPrivateKey>,
|}

export type ProvisionalPublicKey = {|
  app_public_encryption_key: Uint8Array,
  tanker_public_encryption_key: Uint8Array,
|}

export type UserDeviceRecord = {|
  last_reset: Uint8Array,
  ephemeral_public_signature_key: Uint8Array,
  user_id: Uint8Array,
  delegation_signature: Uint8Array,
  public_signature_key: Uint8Array,
  public_encryption_key: Uint8Array,
  user_key_pair: ?UserKeyPair,
  is_ghost_device: bool,

  revoked: number,
|}

// the recipient is a Device Key
export type KeyPublishRecord = {|
  recipient: Uint8Array,
  resourceId: Uint8Array,
  key: Uint8Array,
|}

// the recipient is a User Key
export type KeyPublishToUserRecord = KeyPublishRecord;

// the recipient is a Group Public Key
export type KeyPublishToUserGroupRecord = KeyPublishRecord;

// the recipient is an provisional Public Key
export type KeyPublishToProvisionalUserRecord = KeyPublishRecord;

export type DeviceRevocationRecord = {|
  device_id: Uint8Array,
  user_keys?: UserKeys,
|}

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

export type ProvisionalIdentityClaimRecord = {|
  user_id: Uint8Array,
  app_provisional_identity_signature_public_key: Uint8Array,
  tanker_provisional_identity_signature_public_key: Uint8Array,
  author_signature_by_app_key: Uint8Array,
  author_signature_by_tanker_key: Uint8Array,
  recipient_user_public_key: Uint8Array,
  encrypted_provisional_identity_private_keys: Uint8Array,
|}

export type Record = TrustchainCreationRecord | UserDeviceRecord | DeviceRevocationRecord | ProvisionalIdentityClaimRecord |
                      KeyPublishRecord | KeyPublishToUserRecord | KeyPublishToUserGroupRecord | KeyPublishToProvisionalUserRecord |
                      UserGroupCreationRecordV1 | UserGroupCreationRecordV2 | UserGroupAdditionRecordV1 | UserGroupAdditionRecordV2 |
                      ProvisionalIdentityClaimRecord;

// Warning: When incrementing the block version, make sure to add a block signature to the v2.
const currentVersion = 1;

const hashSize = tcrypto.HASH_SIZE;
const signatureSize = tcrypto.SIGNATURE_SIZE;
const trustchainIdSize = hashSize;

export function serializeBlock(block: Block): Uint8Array {
  if (block.author.length !== hashSize)
    throw new Error('Assertion error: invalid block author size');
  if (block.signature.length !== signatureSize)
    throw new Error('Assertion error: invalid block signature size');
  if (block.trustchain_id.length !== trustchainIdSize)
    throw new Error('Assertion error: invalid block trustchain_id size');

  return utils.concatArrays(
    new Uint8Array(varint.encode(currentVersion)),
    new Uint8Array(varint.encode(block.index)),
    block.trustchain_id,
    new Uint8Array(varint.encode(block.nature)),
    encodeArrayLength(block.payload),
    block.payload,
    block.author,
    block.signature
  );
}

export function unserializeBlock(src: Uint8Array): Block {
  let newOffset = 0;
  let value;
  const version = varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  if (version > currentVersion)
    throw new UpgradeRequiredError(`unsupported block version: ${version}`);
  const index = varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  ({ value, newOffset } = getStaticArray(src, trustchainIdSize, newOffset));
  const trustchain_id = value; // eslint-disable-line camelcase
  value = varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  const nature = value;
  ({ value, newOffset } = getArray(src, newOffset));
  const payload = value;
  ({ value, newOffset } = getStaticArray(src, hashSize, newOffset));
  const author = value;
  ({ value, newOffset } = getStaticArray(src, signatureSize, newOffset));
  const signature = value;

  return { index, trustchain_id, nature, payload, author, signature };
}

export function serializeTrustchainCreation(trustchainCreation: TrustchainCreationRecord): Uint8Array {
  if (trustchainCreation.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid trustchain public key size');

  return trustchainCreation.public_signature_key;
}

export function unserializeTrustchainCreation(src: Uint8Array): TrustchainCreationRecord {
  const { value } = getStaticArray(src, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, 0);
  return { public_signature_key: value };
}

function serializePrivateKey(userKey: UserPrivateKey): Uint8Array {
  return utils.concatArrays(userKey.recipient, userKey.key);
}

function serializeUserKeyPair(userKeyPair: UserKeyPair): Uint8Array {
  return utils.concatArrays(userKeyPair.public_encryption_key, userKeyPair.encrypted_private_encryption_key);
}

function serializeUserKeys(userKeys: UserKeys): Uint8Array {
  return utils.concatArrays(
    userKeys.public_encryption_key,
    userKeys.previous_public_encryption_key,
    userKeys.encrypted_previous_encryption_key,
    encodeListLength(userKeys.private_keys),
    ...userKeys.private_keys.map(serializePrivateKey),
  );
}


export function serializeUserDeviceV3(userDevice: UserDeviceRecord): Uint8Array {
  if (!utils.equalArray(userDevice.last_reset, new Uint8Array(tcrypto.HASH_SIZE)))
    throw new Error('Assertion error: user device last reset must be null');
  if (userDevice.ephemeral_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user device ephemeral public signature key size');
  if (userDevice.user_id.length !== tcrypto.HASH_SIZE)
    throw new Error('Assertion error: invalid user device user id size');
  if (userDevice.delegation_signature.length !== tcrypto.SIGNATURE_SIZE)
    throw new Error('Assertion error: invalid user device delegation signature size');
  if (userDevice.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user device public signature key size');
  if (userDevice.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user device public encryption key size');
  if (!userDevice.user_key_pair)
    throw new Error('Assertion error: invalid user device user key pair');
  if (userDevice.user_key_pair.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user device user public encryption key size');
  if (userDevice.user_key_pair.encrypted_private_encryption_key.length !== SEALED_KEY_SIZE)
    throw new Error('Assertion error: invalid user device user encrypted private encryption key size');

  const deviceFlags = new Uint8Array(1);
  deviceFlags[0] = userDevice.is_ghost_device ? 1 : 0;

  return utils.concatArrays(
    userDevice.ephemeral_public_signature_key,
    userDevice.user_id,
    userDevice.delegation_signature,
    userDevice.public_signature_key,
    userDevice.public_encryption_key,
    // $FlowIssue user_key_pair is not null, I checked for that...
    serializeUserKeyPair(userDevice.user_key_pair),
    deviceFlags,
  );
}

function unserializePrivateKey(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'recipient'),
    (d, o) => getStaticArray(d, SEALED_KEY_SIZE, o, 'key'),
  ], offset);
}

function unserializeUserKeyPair(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => getStaticArray(d, SEALED_KEY_SIZE, o, 'encrypted_private_encryption_key'),
  ], offset, 'user_key_pair');
}

function unserializeUserKeys(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'previous_public_encryption_key'),
    (d, o) => getStaticArray(d, SEALED_KEY_SIZE, o, 'encrypted_previous_encryption_key'),
    (d, o) => unserializeList(d, unserializePrivateKey, o, 'private_keys'),
  ], offset, 'user_keys');
}

export function unserializeUserDeviceV1(src: Uint8Array): UserDeviceRecord {
  return unserializeGeneric(src, [
    (d, o) => ({ last_reset: new Uint8Array(tcrypto.HASH_SIZE), newOffset: o }),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'ephemeral_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'delegation_signature'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => ({ user_key_pair: null, newOffset: o }),
    (d, o) => ({ is_ghost_device: false, newOffset: o }),
    (d, o) => ({ revoked: Number.MAX_SAFE_INTEGER, newOffset: o }),
  ]);
}

export function unserializeUserDeviceV2(src: Uint8Array): UserDeviceRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'last_reset'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'ephemeral_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'delegation_signature'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => ({ user_key_pair: null, newOffset: o }),
    (d, o) => ({ is_ghost_device: false, newOffset: o }),
    (d, o) => ({ revoked: Number.MAX_SAFE_INTEGER, newOffset: o }),
  ]);
}

export function unserializeUserDeviceV3(src: Uint8Array): UserDeviceRecord {
  return unserializeGeneric(src, [
    (d, o) => ({ last_reset: new Uint8Array(tcrypto.HASH_SIZE), newOffset: o }),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'ephemeral_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'delegation_signature'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => unserializeUserKeyPair(d, o),
    (d, o) => ({ is_ghost_device: !!(d[o] & 0x01), newOffset: o + 1 }), // eslint-disable-line no-bitwise
    (d, o) => ({ revoked: Number.MAX_SAFE_INTEGER, newOffset: o }),
  ]);
}

export function serializeKeyPublish(keyPublish: KeyPublishRecord): Uint8Array {
  return utils.concatArrays(
    keyPublish.recipient,
    keyPublish.resourceId,
    keyPublish.key,
  );
}

export function unserializeKeyPublishToDevice(src: Uint8Array): KeyPublishRecord {
  const result = unserializeGeneric(src, [
    (d, o) => getStaticArray(d, hashSize, o, 'recipient'),
    (d, o) => getStaticArray(d, tcrypto.MAC_SIZE, o, 'resourceId'),
    (d, o) => getArray(d, o, 'key'),
  ]);

  if (result.key.length !== tcrypto.SYMMETRIC_KEY_SIZE + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE)
    throw new Error('invalid key publish key size');
  return result;
}

export function unserializeKeyPublishToProvisionalUser(src: Uint8Array): KeyPublishRecord {
  // NOTE: We concatenate the public signature keys of the app and tanker as a single recipient field, since we don't use them separately
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE * 2, o, 'recipient'),
    (d, o) => getStaticArray(d, tcrypto.MAC_SIZE, o, 'resourceId'),
    (d, o) => getStaticArray(d, TWO_TIMES_SEALED_KEY_SIZE, o, 'key'),
  ]);
}

export function unserializeKeyPublish(src: Uint8Array): KeyPublishToUserGroupRecord | KeyPublishToUserRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'recipient'),
    (d, o) => getStaticArray(d, tcrypto.MAC_SIZE, o, 'resourceId'),
    (d, o) => getStaticArray(d, SEALED_KEY_SIZE, o, 'key'),
  ]);
}

export function serializeDeviceRevocationV1(deviceRevocation: DeviceRevocationRecord): Uint8Array {
  if (deviceRevocation.device_id.length !== hashSize)
    throw new Error('Assertion error: invalid device revocation device_id size');

  return deviceRevocation.device_id;
}

export function serializeDeviceRevocationV2(deviceRevocation: DeviceRevocationRecord): Uint8Array {
  if (deviceRevocation.device_id.length !== hashSize)
    throw new Error('Assertion error: invalid device revocation device_id size');
  if (!deviceRevocation.user_keys)
    throw new Error('Assertion error: invalid user device user keys');
  if (deviceRevocation.user_keys.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user device user public encryption key size');
  if (deviceRevocation.user_keys.previous_public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user device user previous public encryption key size');
  if (deviceRevocation.user_keys.encrypted_previous_encryption_key.length !== SEALED_KEY_SIZE)
    throw new Error('Assertion error: invalid user device user previous encrypted private encryption key size');
  for (const key of deviceRevocation.user_keys.private_keys) {
    if (key.recipient.length !== tcrypto.HASH_SIZE)
      throw new Error('Assertion error: invalid user device encrypted key recipient size');
    if (key.key.length !== SEALED_KEY_SIZE)
      throw new Error('Assertion error: invalid user device user encrypted private encryption key size');
  }

  return utils.concatArrays(
    deviceRevocation.device_id,
    serializeUserKeys(deviceRevocation.user_keys)
  );
}

export function unserializeDeviceRevocationV1(src: Uint8Array): DeviceRevocationRecord {
  return { device_id: getStaticArray(src, hashSize, 0).value };
}

export function unserializeDeviceRevocationV2(src: Uint8Array): DeviceRevocationRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, hashSize, o, 'device_id'),
    (d, o) => unserializeUserKeys(d, o),
  ]);
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

function checkGroupEncryptedKeyV1(blockType: string, key: GroupEncryptedKeyV1): void {
  if (key.public_user_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error(`Assertion error: invalid ${blockType} recipient user public key size`);
  if (key.encrypted_group_private_encryption_key.length !== tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE)
    throw new Error(`Assertion error: invalid ${blockType} encrypted group private encryption key size`);
}

function checkGroupEncryptedKeyV2(blockType: string, key: GroupEncryptedKeyV2): void {
  if (key.user_id.length !== tcrypto.HASH_SIZE)
    throw new Error(`Assertion error: invalid ${blockType} recipient user id size`);
  if (key.public_user_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error(`Assertion error: invalid ${blockType} recipient user public key size`);
  if (key.encrypted_group_private_encryption_key.length !== tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE)
    throw new Error(`Assertion error: invalid ${blockType} encrypted group private encryption key size`);
}

function checkProvisionalGroupEncryptedKeyV2(blockType: string, key: ProvisionalGroupEncryptedKeyV2): void {
  if (key.app_provisional_user_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new Error(`Assertion error: invalid ${blockType} app signature public key size`);
  if (key.tanker_provisional_user_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new Error(`Assertion error: invalid ${blockType} tanker signature public key size`);
  if (key.encrypted_group_private_encryption_key.length !== TWO_TIMES_SEALED_KEY_SIZE)
    throw new Error(`Assertion error: invalid ${blockType} encrypted group private encryption key size`);
}

export function serializeUserGroupCreationV1(userGroupCreation: UserGroupCreationRecordV1): Uint8Array {
  if (userGroupCreation.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user group creation group public signature key size');
  if (userGroupCreation.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user group creation group public encryption key size');
  if (userGroupCreation.encrypted_group_private_signature_key.length !== tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE)
    throw new Error('Assertion error: invalid user group creation encrypted group private signature key size');
  userGroupCreation.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV1('user group creation V1', k));
  if (userGroupCreation.self_signature.length !== tcrypto.SIGNATURE_SIZE)
    throw new Error('Assertion error: invalid user group creation group self signature size');

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
    throw new Error('Assertion error: invalid user group creation group public signature key size');
  if (userGroupCreation.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid user group creation group public encryption key size');
  if (userGroupCreation.encrypted_group_private_signature_key.length !== tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE)
    throw new Error('Assertion error: invalid user group creation encrypted group private signature key size');
  userGroupCreation.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV2('user group creation V2', k));
  userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users.forEach(k => checkProvisionalGroupEncryptedKeyV2('user group creation V2', k));
  if (userGroupCreation.self_signature.length !== tcrypto.SIGNATURE_SIZE)
    throw new Error('Assertion error: invalid user group creation group self signature size');

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

export function serializeUserGroupAdditionV1(userGroupAddition: UserGroupAdditionRecordV1): Uint8Array {
  if (userGroupAddition.previous_group_block.length !== tcrypto.HASH_SIZE)
    throw new Error('Assertion error: invalid user group addition previous group block size');
  userGroupAddition.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV1('user group add V1', k));
  if (userGroupAddition.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new Error('Assertion error: invalid user group addition group self signature size');

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
    throw new Error('Assertion error: invalid user group addition previous group block size');
  userGroupAddition.encrypted_group_private_encryption_keys_for_users.forEach(k => checkGroupEncryptedKeyV2('user group add V2', k));
  userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users.forEach(k => checkProvisionalGroupEncryptedKeyV2('user group creation V2', k));
  if (userGroupAddition.self_signature_with_current_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new Error('Assertion error: invalid user group addition group self signature size');

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

export function serializeProvisionalIdentityClaim(provisionalIdentityClaim: ProvisionalIdentityClaimRecord): Uint8Array {
  if (provisionalIdentityClaim.user_id.length !== tcrypto.HASH_SIZE)
    throw new Error('Assertion error: invalid claim provisional user id size');
  if (provisionalIdentityClaim.app_provisional_identity_signature_public_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid claim provisional app public key size');
  if (provisionalIdentityClaim.tanker_provisional_identity_signature_public_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid claim provisional tanker public key size');
  if (provisionalIdentityClaim.author_signature_by_app_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new Error('Assertion error: invalid claim provisional app signature size');
  if (provisionalIdentityClaim.author_signature_by_tanker_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new Error('Assertion error: invalid claim provisional tanker signature size');
  if (provisionalIdentityClaim.recipient_user_public_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new Error('Assertion error: invalid claim provisional recipient key size');
  if (provisionalIdentityClaim.encrypted_provisional_identity_private_keys.length !== tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE * 2
                                                            + tcrypto.SEAL_OVERHEAD)
    throw new Error('Assertion error: invalid claim provisional encrypted keys size');

  return utils.concatArrays(
    provisionalIdentityClaim.user_id,
    provisionalIdentityClaim.app_provisional_identity_signature_public_key,
    provisionalIdentityClaim.tanker_provisional_identity_signature_public_key,
    provisionalIdentityClaim.author_signature_by_app_key,
    provisionalIdentityClaim.author_signature_by_tanker_key,
    provisionalIdentityClaim.recipient_user_public_key,
    provisionalIdentityClaim.encrypted_provisional_identity_private_keys,
  );
}

export function unserializeProvisionalIdentityClaim(src: Uint8Array): ProvisionalIdentityClaimRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'app_provisional_identity_signature_public_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'tanker_provisional_identity_signature_public_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'author_signature_by_app_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'author_signature_by_tanker_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'recipient_user_public_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE * 2
                                + tcrypto.SEAL_OVERHEAD, o, 'encrypted_provisional_identity_private_keys'),
  ]);
}

export function unserializePayload(block: Block): Record {
  switch (block.nature) {
    case NATURE.trustchain_creation: return unserializeTrustchainCreation(block.payload);
    case NATURE.device_creation_v1: return unserializeUserDeviceV1(block.payload);
    case NATURE.device_creation_v2: return unserializeUserDeviceV2(block.payload);
    case NATURE.device_creation_v3: return unserializeUserDeviceV3(block.payload);
    case NATURE.key_publish_to_device: return unserializeKeyPublishToDevice(block.payload);
    case NATURE.key_publish_to_user: return unserializeKeyPublish(block.payload);
    case NATURE.key_publish_to_user_group: return unserializeKeyPublish(block.payload);
    case NATURE.key_publish_to_provisional_user: return unserializeKeyPublishToProvisionalUser(block.payload);
    case NATURE.device_revocation_v1: return unserializeDeviceRevocationV1(block.payload);
    case NATURE.device_revocation_v2: return unserializeDeviceRevocationV2(block.payload);
    case NATURE.user_group_creation_v1: return unserializeUserGroupCreationV1(block.payload);
    case NATURE.user_group_creation_v2: return unserializeUserGroupCreationV2(block.payload);
    case NATURE.user_group_addition_v1: return unserializeUserGroupAdditionV1(block.payload);
    case NATURE.user_group_addition_v2: return unserializeUserGroupAdditionV2(block.payload);
    case NATURE.provisional_identity_claim: return unserializeProvisionalIdentityClaim(block.payload);
    default: throw new UpgradeRequiredError(`unknown nature: ${block.nature}`);
  }
}
