import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type {
  UserGroupCreationRecord,
  UserGroupCreationRecordV1,
  UserGroupCreationRecordV2,
  UserGroupCreationRecordV3,
  UserGroupAdditionRecordV1,
  UserGroupAdditionRecordV2,
  UserGroupAdditionRecordV3,
  UserGroupAdditionRecord,
  UserGroupEntry,
} from './Serialize';
import {
  getUserGroupCreationBlockSignDataV1,
  getUserGroupCreationBlockSignDataV2,
  getUserGroupCreationBlockSignDataV3,
  getUserGroupAdditionBlockSignDataV1,
  getUserGroupAdditionBlockSignDataV2,
  getUserGroupAdditionBlockSignDataV3,
} from './Serialize';

import type { Group } from './types';

import { InvalidBlockError } from '../errors.internal';

import { NATURE } from '../Blocks/Nature';

export function verifyUserGroupCreation(entry: UserGroupEntry, devicePublicSignatureKey: Uint8Array, existingGroup?: Group) {
  const currentPayload: UserGroupCreationRecord = (entry as any);

  if (!tcrypto.verifySignature(entry.hash, entry.signature, devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', entry);

  if (existingGroup && !utils.equalArray(existingGroup.lastPublicEncryptionKey, currentPayload.public_encryption_key)) {
    throw new InvalidBlockError('group_already_exists', 'a group with the same public signature key already exists', entry);
  }

  let selfSigBuffer;
  if (entry.nature === NATURE.user_group_creation_v1) {
    const versionedPayload: UserGroupCreationRecordV1 = (currentPayload as any);
    selfSigBuffer = getUserGroupCreationBlockSignDataV1(versionedPayload);
  } else if (entry.nature === NATURE.user_group_creation_v2) {
    const versionedPayload: UserGroupCreationRecordV2 = (currentPayload as any);
    selfSigBuffer = getUserGroupCreationBlockSignDataV2(versionedPayload);
  } else if (entry.nature === NATURE.user_group_creation_v3) {
    const versionedPayload: UserGroupCreationRecordV3 = (currentPayload as any);
    selfSigBuffer = getUserGroupCreationBlockSignDataV3(versionedPayload);
  } else {
    throw new InvalidBlockError('invalid_nature', 'invalid nature for user group creation', { entry });
  }

  if (!tcrypto.verifySignature(selfSigBuffer, currentPayload.self_signature, currentPayload.public_signature_key))
    throw new InvalidBlockError('invalid_self_signature', 'self signature is invalid', entry);
}

export function verifyUserGroupAddition(entry: UserGroupEntry, devicePublicSignatureKey: Uint8Array, currentGroup?: Group) {
  const currentPayload: UserGroupAdditionRecord = (entry as any);

  if (!tcrypto.verifySignature(entry.hash, entry.signature, devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', entry);

  if (!currentGroup)
    throw new InvalidBlockError('invalid_group_id', 'cannot find group id', entry);

  let selfSigBuffer;
  if (entry.nature === NATURE.user_group_addition_v1) {
    const versionedPayload: UserGroupAdditionRecordV1 = (currentPayload as any);
    selfSigBuffer = getUserGroupAdditionBlockSignDataV1(versionedPayload);
  } else if (entry.nature === NATURE.user_group_addition_v2) {
    const versionedPayload: UserGroupAdditionRecordV2 = (currentPayload as any);
    selfSigBuffer = getUserGroupAdditionBlockSignDataV2(versionedPayload);
  } else if (entry.nature === NATURE.user_group_addition_v3) {
    const versionedPayload: UserGroupAdditionRecordV3 = (currentPayload as any);
    selfSigBuffer = getUserGroupAdditionBlockSignDataV3(versionedPayload);
  } else {
    throw new InvalidBlockError('invalid_nature', 'invalid nature for user group addition', { entry });
  }

  if (!tcrypto.verifySignature(selfSigBuffer, currentPayload.self_signature_with_current_key, currentGroup.lastPublicSignatureKey))
    throw new InvalidBlockError('invalid_self_signature', 'self signature is invalid', entry);
}

export function verifyGroupAction(action: UserGroupEntry, devicePublicSignatureKey: Uint8Array, group?: Group) {
  if (action.nature === NATURE.user_group_creation_v3 || action.nature === NATURE.user_group_creation_v2 || action.nature === NATURE.user_group_creation_v1) {
    verifyUserGroupCreation(action, devicePublicSignatureKey, group);
  } else if (action.nature === NATURE.user_group_addition_v3 || action.nature === NATURE.user_group_addition_v2 || action.nature === NATURE.user_group_addition_v1) {
    verifyUserGroupAddition(action, devicePublicSignatureKey, group);
  } else {
    throw new InternalError('Assertion error: entry to verify is not a group');
  }
}
