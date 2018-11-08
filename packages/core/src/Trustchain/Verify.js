// @flow

import find from 'array-find';
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidBlockError } from '../errors';
import { findIndex } from '../utils';
import { getLastUserPublicKey, type User, type Device } from '../Users/UserStore';
import { type ExternalGroup } from '../Groups/types';
import { getUserGroupCreationBlockSignData, getUserGroupAdditionBlockSignData } from '../Blocks/BlockGenerator';
import { type UnverifiedKeyPublish, type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import type { UnverifiedDeviceCreation, UnverifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { type UnverifiedUserGroup, type VerifiedUserGroup } from '../UnverifiedStore/UserGroupsUnverifiedStore';
import { type UnverifiedTrustchainCreation } from '../Trustchain/TrustchainStore';

import {
  type UserGroupCreationRecord,
  type UserGroupAdditionRecord,
  NATURE,
  isTrustchainCreation,
  isKeyPublishToDevice,
  isKeyPublishToUser,
  isKeyPublishToUserGroup,
} from '../Blocks/payloads';

export const rootBlockAuthor = new Uint8Array(32);

export function verifyTrustchainCreation(trustchainCreation: UnverifiedTrustchainCreation, trustchainId: Uint8Array) {
  if (!isTrustchainCreation(trustchainCreation.nature))
    throw new InvalidBlockError('invalid_nature', 'invalid nature for trustchain creation', { trustchainCreation });

  if (!utils.equalArray(trustchainCreation.author, rootBlockAuthor))
    throw new InvalidBlockError('invalid_author_for_trustchain_creation', 'author of trustchain_creation must be 0', { trustchainCreation });

  if (!utils.isNullArray(trustchainCreation.signature))
    throw new InvalidBlockError('invalid_signature', 'signature must be 0', { trustchainCreation });

  if (!utils.equalArray(trustchainCreation.hash, trustchainId))
    throw new InvalidBlockError('invalid_root_block', 'the root block does not correspond to this trustchain', { trustchainCreation, trustchainId });
}

export function verifyDeviceCreation(entry: UnverifiedDeviceCreation, authorUser: ?User, authorDevice: ?Device, authorKey: Uint8Array, user: ?User) {
  if (!utils.isNullArray(entry.last_reset))
    throw new InvalidBlockError('invalid_last_reset', 'last_reset is not null', { entry });

  const userPublicKey = user ? getLastUserPublicKey(user) : null;
  if (userPublicKey && entry.nature !== NATURE.device_creation_v3)
    throw new InvalidBlockError('forbidden', 'device creation version mismatch', { entry, authorDevice });

  if (!utils.isNullArray(entry.last_reset))
    throw new InvalidBlockError('invalid_last_reset', 'last_reset is not null', { entry });

  const delegationBuffer = utils.concatArrays(entry.ephemeral_public_signature_key, entry.user_id);
  if (!tcrypto.verifySignature(delegationBuffer, entry.delegation_signature, authorKey))
    throw new InvalidBlockError('invalid_delegation_signature', 'delegation signature is invalid', { entry, authorDevice });

  if (!tcrypto.verifySignature(entry.hash, entry.signature, entry.ephemeral_public_signature_key))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, authorDevice });

  if (authorDevice) {
    if (authorDevice.revokedAt < entry.index)
      throw new InvalidBlockError('revoked_author_error', 'device creaton author is revoked', { entry });

    if (entry.nature === NATURE.device_creation_v3 && userPublicKey && entry.user_key_pair
        && !utils.equalArray(entry.user_key_pair.public_encryption_key, userPublicKey))
      throw new InvalidBlockError('invalid_public_user_key', 'public_user_key is different than the author\'s one', { entry, authorDevice });

    if (!authorUser)
      throw new Error('Assertion error: We have an author device, but no author user!?');

    if (utils.toBase64(entry.user_id) !== authorUser.userId)
      throw new InvalidBlockError('forbidden', 'the author is not authorized to create a device for this user', { entry, authorDevice });

    if (entry.is_server_device !== authorDevice.isServerDevice) {
      throw new InvalidBlockError('invalid_author_type', 'device type mismatch', { entry, authorDevice });
    }
  } else {
    if (!user || user.devices.length === 0)
      return;

      // If we're already verified, then it's not an error
    const entryDeviceId = utils.toBase64(entry.hash);
    if (!user.devices.some(device => device.deviceId === entryDeviceId))
      throw new InvalidBlockError('forbidden', 'the user already has a device, this can\'t be the first device', { entry });
  }
}

export function verifyDeviceRevocation(entry: UnverifiedDeviceRevocation, authorUserId: b64string, authorKey: Uint8Array, targetUser: ?User) {
  if (!tcrypto.verifySignature(entry.hash, entry.signature, authorKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, authorKey });

  if (!targetUser)
    throw new InvalidBlockError('invalid_revoked_user', 'could not find revoked user in user store', { entry });
  const revokedDevice = find(targetUser.devices, d => utils.equalArray(utils.fromBase64(d.deviceId), entry.device_id));
  if (!revokedDevice)
    throw new InvalidBlockError('invalid_revoked_device', 'can\'t find target of device revocation block', { entry });
  if (revokedDevice.revokedAt < entry.index)
    throw new InvalidBlockError('device_already_revoked', 'target of device_revocation block is already revoked', { entry, revokedDevice });

  if (authorUserId !== targetUser.userId)
    throw new InvalidBlockError('forbidden', 'Device Revocation Block author does not match revoked device user ID', { entry, authorUserId });

  if (entry.nature === NATURE.device_revocation_v1) {
    if (targetUser.userPublicKeys.length !== 0)
      throw new InvalidBlockError('invalid_revocation_version', 'cannot use a device revocation v1 if the target has a user key', { entry, targetUser });
  } else {
    const newKeys = entry.user_keys;
    if (!newKeys)
      throw new InvalidBlockError('missing_user_keys', 'missing user keys', { entry });
    const userPublicKey = getLastUserPublicKey(targetUser);
    if (userPublicKey && !utils.equalArray(newKeys.previous_public_encryption_key, userPublicKey))
      throw new InvalidBlockError('invalid_previous_key', 'previous public user encryption key does not match', { entry, targetUser });

    const activeDevices = targetUser.devices.filter(d => d.revokedAt > entry.index && d.deviceId !== utils.toBase64(entry.device_id));
    if (activeDevices.length !== newKeys.private_keys.length)
      throw new InvalidBlockError('invalid_new_key', 'device number mismatch', { entry, targetUser, activeDeviceCount: activeDevices.length, userKeysCount: newKeys.private_keys.length });
    for (const device of activeDevices) {
      const devId = utils.fromBase64(device.deviceId);
      if (findIndex(newKeys.private_keys, k => utils.equalArray(k.recipient, devId)) === -1)
        throw new InvalidBlockError('invalid_new_key', 'missing encrypted private key for an active device', { entry, targetUser });
    }
  }
}

function verifyKeyPublishToDevice(entry: UnverifiedKeyPublish, author: Device, recipient: ?User) {
  if (!recipient)
    throw new InvalidBlockError('invalid_recipient', 'recipient is not a valid device', { entry, author });
  for (const userKey of recipient.userPublicKeys)
    if (userKey.index < entry.index)
      throw new InvalidBlockError('version_mismatch', 'cannot send a key publish V1 to a user V3', { entry, author, recipient });
}

function verifyKeyPublishToUser(entry: UnverifiedKeyPublish, author: Device, recipient: ?User) {
  if (!recipient)
    throw new InvalidBlockError('invalid_recipient', 'recipient is not a valid user', { entry, author });

  const indexUserKey = find(recipient.userPublicKeys, userPublicKey => utils.equalArray(userPublicKey.userPublicKey, entry.recipient));

  if (!indexUserKey || indexUserKey.index > entry.index)
    throw new InvalidBlockError('invalid_user_public_key', 'user public key has been superseeded', { entry, author });

  const futureUserKey = find(recipient.userPublicKeys, userPublicKey => userPublicKey.index > indexUserKey.index);

  if (futureUserKey && entry.index > futureUserKey.index)
    throw new InvalidBlockError('invalid_user_public_key', 'user public key has been superseeded', { entry, author });
}

function verifyKeyPublishToUserGroup(entry: UnverifiedKeyPublish, author: Device, recipient: ?ExternalGroup) {
  if (!recipient)
    throw new InvalidBlockError('invalid_recipient', 'recipient is not a valid group', { entry, author });
}

export function verifyKeyPublish(keyPublish: UnverifiedKeyPublish, author: Device, recipientUser: ?User, recipientGroup: ?ExternalGroup): VerifiedKeyPublish {
  if (!tcrypto.verifySignature(keyPublish.hash, keyPublish.signature, author.devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { keyPublish, author });

  if (isKeyPublishToDevice(keyPublish.nature)) {
    verifyKeyPublishToDevice(keyPublish, author, recipientUser);
  } else if (isKeyPublishToUser(keyPublish.nature)) {
    verifyKeyPublishToUser(keyPublish, author, recipientUser);
  } else if (isKeyPublishToUserGroup(keyPublish.nature)) {
    verifyKeyPublishToUserGroup(keyPublish, author, recipientGroup);
  }

  return {
    resourceId: keyPublish.resourceId,
    key: keyPublish.key,
    recipient: keyPublish.recipient,
    author: keyPublish.author,
    nature: keyPublish.nature,
  };
}

export function verifyUserGroupCreation(entry: UnverifiedUserGroup, author: Device, existingGroup: ?ExternalGroup): VerifiedUserGroup {
  const currentPayload: UserGroupCreationRecord = (entry: any);

  if (!tcrypto.verifySignature(entry.hash, entry.signature, author.devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, author });

  if (existingGroup && !utils.equalArray(existingGroup.publicEncryptionKey, currentPayload.public_encryption_key)) {
    throw new InvalidBlockError('group_already_exists', 'a group with the same public signature key already exists', { entry, author });
  }

  const selfSigBuffer = getUserGroupCreationBlockSignData(currentPayload);
  if (!tcrypto.verifySignature(selfSigBuffer, currentPayload.self_signature, currentPayload.public_signature_key))
    throw new InvalidBlockError('invalid_self_signature', 'self signature is invalid', { entry, author });

  return (entry: VerifiedUserGroup);
}

export function verifyUserGroupAddition(entry: UnverifiedUserGroup, author: Device, currentGroup: ?ExternalGroup): VerifiedUserGroup {
  const currentPayload: UserGroupAdditionRecord = (entry: any);

  if (!tcrypto.verifySignature(entry.hash, entry.signature, author.devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, author });

  if (!currentGroup)
    throw new InvalidBlockError('invalid_group_id', 'cannot find group id', { entry, author });

  if (!utils.equalArray(currentPayload.previous_group_block, currentGroup.lastGroupBlock))
    throw new InvalidBlockError('invalid_previous_group_block', 'previous group block does not match for this group id', { entry, author, currentGroup });

  const selfSigBuffer = getUserGroupAdditionBlockSignData(currentPayload);
  if (!tcrypto.verifySignature(selfSigBuffer, currentPayload.self_signature_with_current_key, currentGroup.publicSignatureKey))
    throw new InvalidBlockError('invalid_self_signature', 'self signature is invalid', { entry, author });

  return (entry: VerifiedUserGroup);
}
