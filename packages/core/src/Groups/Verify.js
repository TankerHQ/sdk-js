// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import { getUserGroupCreationBlockSignDataV1, getUserGroupCreationBlockSignDataV2, getUserGroupAdditionBlockSignDataV1, getUserGroupAdditionBlockSignDataV2 } from '../Blocks/BlockGenerator';

import { type Group } from './types';

import { InvalidBlockError } from '../errors.internal';

import { NATURE } from '../Blocks/Nature';

import { type Device } from '../Users/types';

import {
  type UserGroupCreationRecord,
  type UserGroupCreationRecordV1,
  type UserGroupCreationRecordV2,
  type UserGroupAdditionRecordV1,
  type UserGroupAdditionRecordV2,
  type UserGroupAdditionRecord,
  type UserGroupEntry,
} from './Serialize';

export function verifyUserGroupCreation(entry: UserGroupEntry, author: Device, existingGroup: ?Group) {
  const currentPayload: UserGroupCreationRecord = (entry: any);

  if (!tcrypto.verifySignature(entry.hash, entry.signature, author.devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, author });

  if (existingGroup && !utils.equalArray(existingGroup.publicEncryptionKey, currentPayload.public_encryption_key)) {
    throw new InvalidBlockError('group_already_exists', 'a group with the same public signature key already exists', { entry, author });
  }

  let selfSigBuffer;
  if (entry.nature === NATURE.user_group_creation_v1) {
    const versionedPayload: UserGroupCreationRecordV1 = (currentPayload: any);
    selfSigBuffer = getUserGroupCreationBlockSignDataV1(versionedPayload);
  } else if (entry.nature === NATURE.user_group_creation_v2) {
    const versionedPayload: UserGroupCreationRecordV2 = (currentPayload: any);
    selfSigBuffer = getUserGroupCreationBlockSignDataV2(versionedPayload);
  } else {
    throw new InvalidBlockError('invalid_nature', 'invalid nature for user group creation', { entry });
  }
  if (!tcrypto.verifySignature(selfSigBuffer, currentPayload.self_signature, currentPayload.public_signature_key))
    throw new InvalidBlockError('invalid_self_signature', 'self signature is invalid', { entry, author });
}

export function verifyUserGroupAddition(entry: UserGroupEntry, author: Device, currentGroup: ?Group) {
  const currentPayload: UserGroupAdditionRecord = (entry: any);

  if (!tcrypto.verifySignature(entry.hash, entry.signature, author.devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, author });

  if (!currentGroup)
    throw new InvalidBlockError('invalid_group_id', 'cannot find group id', { entry, author });

  if (!utils.equalArray(currentPayload.previous_group_block, currentGroup.lastGroupBlock))
    throw new InvalidBlockError('invalid_previous_group_block', 'previous group block does not match for this group id', { entry, author, currentGroup });

  let selfSigBuffer;
  if (entry.nature === NATURE.user_group_addition_v1) {
    const versionedPayload: UserGroupAdditionRecordV1 = (currentPayload: any);
    selfSigBuffer = getUserGroupAdditionBlockSignDataV1(versionedPayload);
  } else if (entry.nature === NATURE.user_group_addition_v2) {
    const versionedPayload: UserGroupAdditionRecordV2 = (currentPayload: any);
    selfSigBuffer = getUserGroupAdditionBlockSignDataV2(versionedPayload);
  } else {
    throw new InvalidBlockError('invalid_nature', 'invalid nature for user group creation', { entry });
  }
  if (!tcrypto.verifySignature(selfSigBuffer, currentPayload.self_signature_with_current_key, currentGroup.publicSignatureKey))
    throw new InvalidBlockError('invalid_self_signature', 'self signature is invalid', { entry, author });
}

export function verifyGroupAction(action: UserGroupEntry, author: Device, group: ?Group) {
  if (action.nature === NATURE.user_group_creation_v2 || action.nature === NATURE.user_group_creation_v1) {
    verifyUserGroupCreation(action, author, group);
  } else if (action.nature === NATURE.user_group_addition_v2 || action.nature === NATURE.user_group_addition_v1) {
    verifyUserGroupAddition(action, author, group);
  } else {
    throw new InternalError('Assertion error: entry to verify is not a group');
  }
}
