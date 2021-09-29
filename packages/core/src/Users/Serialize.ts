import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { getStaticArray, getStaticBool, encodeListLength, unserializeGenericSub, unserializeGeneric, unserializeList } from '../Blocks/Serialize';
import type { VerificationFields } from '../Blocks/Block';
import { hashBlock } from '../Blocks/Block';
import { unserializeBlock } from '../Blocks/payloads';
import { NATURE } from '../Blocks/Nature';

type UserPrivateKey = {
  recipient: Uint8Array;
  key: Uint8Array;
};

export type UserKeyPair = {
  public_encryption_key: Uint8Array;
  encrypted_private_encryption_key: Uint8Array;
};

export type UserKeys = {
  public_encryption_key: Uint8Array;
  previous_public_encryption_key: Uint8Array;
  encrypted_previous_encryption_key: Uint8Array;
  private_keys: Array<UserPrivateKey>;
};

export type DeviceCreationRecord = {
  last_reset: Uint8Array;
  ephemeral_public_signature_key: Uint8Array;
  user_id: Uint8Array;
  delegation_signature: Uint8Array;
  public_signature_key: Uint8Array;
  public_encryption_key: Uint8Array;
  user_key_pair: UserKeyPair;
  is_ghost_device: boolean;

  revoked: number;
};

export type DeviceRevocationRecord = {
  device_id: Uint8Array;
  user_keys?: UserKeys;
};

export type DeviceCreationEntry = DeviceCreationRecord & VerificationFields;

export type DeviceRevocationEntry = DeviceRevocationRecord & VerificationFields;

export type UserEntry = DeviceCreationEntry | DeviceRevocationEntry;

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
    ...userKeys.private_keys.map(key => serializePrivateKey(key)),
  );
}

export function serializeUserDeviceV3(userDevice: DeviceCreationRecord): Uint8Array {
  if (!utils.equalArray(userDevice.last_reset, new Uint8Array(tcrypto.HASH_SIZE)))
    throw new InternalError('Assertion error: user device last reset must be null');
  if (userDevice.ephemeral_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user device ephemeral public signature key size');
  if (userDevice.user_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid user device user id size');
  if (userDevice.delegation_signature.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid user device delegation signature size');
  if (userDevice.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user device public signature key size');
  if (userDevice.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user device public encryption key size');
  if (!userDevice.user_key_pair)
    throw new InternalError('Assertion error: invalid user device user key pair');
  if (userDevice.user_key_pair.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user device user public encryption key size');
  if (userDevice.user_key_pair.encrypted_private_encryption_key.length !== tcrypto.SEALED_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user device user encrypted private encryption key size');

  const deviceFlags = new Uint8Array(1);
  deviceFlags[0] = userDevice.is_ghost_device ? 1 : 0;

  return utils.concatArrays(
    userDevice.ephemeral_public_signature_key,
    userDevice.user_id,
    userDevice.delegation_signature,
    userDevice.public_signature_key,
    userDevice.public_encryption_key,
    serializeUserKeyPair(userDevice.user_key_pair),
    deviceFlags,
  );
}

function unserializePrivateKey(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'recipient'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_KEY_SIZE, o, 'key'),
  ], offset);
}

function unserializeUserKeyPair(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_KEY_SIZE, o, 'encrypted_private_encryption_key'),
  ], offset, 'user_key_pair');
}

function unserializeUserKeys(src: Uint8Array, offset: number) {
  return unserializeGenericSub(src, [
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'previous_public_encryption_key'),
    (d, o) => getStaticArray(d, tcrypto.SEALED_KEY_SIZE, o, 'encrypted_previous_encryption_key'),
    (d, o) => unserializeList(d, unserializePrivateKey, o, 'private_keys'),
  ], offset, 'user_keys');
}

export function unserializeUserDeviceV1(src: Uint8Array): DeviceCreationRecord {
  return unserializeGeneric(src, [
    (_, o) => ({ last_reset: new Uint8Array(tcrypto.HASH_SIZE), newOffset: o }),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'ephemeral_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'delegation_signature'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (_, o) => ({ user_key_pair: null, newOffset: o }),
    (_, o) => ({ is_ghost_device: false, newOffset: o }),
    (_, o) => ({ revoked: Number.MAX_SAFE_INTEGER, newOffset: o }),
  ]);
}

export function unserializeUserDeviceV2(src: Uint8Array): DeviceCreationRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'last_reset'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'ephemeral_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'delegation_signature'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (_, o) => ({ user_key_pair: null, newOffset: o }),
    (_, o) => ({ is_ghost_device: false, newOffset: o }),
    (_, o) => ({ revoked: Number.MAX_SAFE_INTEGER, newOffset: o }),
  ]);
}

export function unserializeUserDeviceV3(src: Uint8Array): DeviceCreationRecord {
  return unserializeGeneric(src, [
    (_, o) => ({ last_reset: new Uint8Array(tcrypto.HASH_SIZE), newOffset: o }),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'ephemeral_public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'delegation_signature'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'public_signature_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'public_encryption_key'),
    (d, o) => unserializeUserKeyPair(d, o),
    (d, o) => getStaticBool(d, o, 'is_ghost_device'),
    (_, o) => ({ revoked: Number.MAX_SAFE_INTEGER, newOffset: o }),
  ]);
}

export function serializeDeviceRevocationV1(deviceRevocation: DeviceRevocationRecord): Uint8Array {
  if (deviceRevocation.device_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid device revocation device_id size');

  return deviceRevocation.device_id;
}

export function serializeDeviceRevocationV2(deviceRevocation: DeviceRevocationRecord): Uint8Array {
  if (deviceRevocation.device_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid device revocation device_id size');
  if (!deviceRevocation.user_keys)
    throw new InternalError('Assertion error: invalid user device user keys');
  if (deviceRevocation.user_keys.public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user device user public encryption key size');
  if (deviceRevocation.user_keys.previous_public_encryption_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user device user previous public encryption key size');
  if (deviceRevocation.user_keys.encrypted_previous_encryption_key.length !== tcrypto.SEALED_KEY_SIZE)
    throw new InternalError('Assertion error: invalid user device user previous encrypted private encryption key size');
  for (const key of deviceRevocation.user_keys.private_keys) {
    if (key.recipient.length !== tcrypto.HASH_SIZE)
      throw new InternalError('Assertion error: invalid user device encrypted key recipient size');
    if (key.key.length !== tcrypto.SEALED_KEY_SIZE)
      throw new InternalError('Assertion error: invalid user device user encrypted private encryption key size');
  }

  return utils.concatArrays(
    deviceRevocation.device_id,
    serializeUserKeys(deviceRevocation.user_keys),
  );
}

export function unserializeDeviceRevocationV1(src: Uint8Array): DeviceRevocationRecord {
  return { device_id: getStaticArray(src, tcrypto.HASH_SIZE, 0)['value']! };
}

export function unserializeDeviceRevocationV2(src: Uint8Array): DeviceRevocationRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'device_id'),
    (d, o) => unserializeUserKeys(d, o),
  ]);
}

export function isDeviceCreation(entry: UserEntry): entry is DeviceCreationEntry {
  return entry.nature === NATURE.device_creation_v1 || entry.nature === NATURE.device_creation_v2 || entry.nature === NATURE.device_creation_v3;
}

export function isDeviceRevocation(entry: UserEntry): entry is DeviceRevocationEntry {
  return entry.nature === NATURE.device_revocation_v1 || entry.nature === NATURE.device_revocation_v2;
}

export function userEntryFromBlock(b64Block: string): UserEntry {
  const block = unserializeBlock(utils.fromBase64(b64Block));

  const author = block.author;
  const signature = block.signature;
  const nature = block.nature;
  const hash = hashBlock(block);

  const toCreationEntry = (record: DeviceCreationRecord): UserEntry => ({
    ...record,
    author,
    signature,
    nature,
    hash,
  });

  const toRevocationEntry = (record: DeviceRevocationRecord): UserEntry => ({
    ...record,
    author,
    signature,
    nature,
    hash,
  });
  switch (block.nature) {
    case NATURE.device_creation_v1:
      return toCreationEntry(unserializeUserDeviceV1(block.payload));
    case NATURE.device_creation_v2:
      return toCreationEntry(unserializeUserDeviceV2(block.payload));
    case NATURE.device_creation_v3:
      return toCreationEntry(unserializeUserDeviceV3(block.payload));
    case NATURE.device_revocation_v1:
      return toRevocationEntry(unserializeDeviceRevocationV1(block.payload));
    case NATURE.device_revocation_v2:
      return toRevocationEntry(unserializeDeviceRevocationV2(block.payload));
    default:
      throw new InternalError('Assertion error: wrong block nature for userEntryFromBlock');
  }
}
