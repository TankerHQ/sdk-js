// @flow

import find from 'array-find';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { InvalidBlockError } from '../errors.internal';
import { findIndex } from '../utils';

import { type User, type Device, getLastUserPublicKey } from './types';
import type { DeviceCreationEntry, DeviceRevocationEntry } from './Serialize';

import {
  NATURE,
} from '../Blocks/Nature';

export function verifyDeviceCreation(entry: DeviceCreationEntry, authorUser: ?User, trustchainPublicKey: Uint8Array) {
  if (!utils.isNullArray(entry.last_reset))
    throw new InvalidBlockError('invalid_last_reset', 'last_reset is not null', { entry });

  const userPublicKey = authorUser ? getLastUserPublicKey(authorUser) : null;
  if (userPublicKey && entry.nature !== NATURE.device_creation_v3)
    throw new InvalidBlockError('forbidden', 'device creation version mismatch', { entry });

  if (!tcrypto.verifySignature(entry.hash, entry.signature, entry.ephemeral_public_signature_key))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry });

  const delegationBuffer = utils.concatArrays(entry.ephemeral_public_signature_key, entry.user_id);

  if (authorUser) {
    const authorDevice: Device = find(authorUser.devices, d => utils.equalArray(utils.fromBase64(d.deviceId), entry.author));
    if (!tcrypto.verifySignature(delegationBuffer, entry.delegation_signature, authorDevice.devicePublicSignatureKey))
      throw new InvalidBlockError('invalid_delegation_signature', 'invalid signature from device creation author', { entry, authorDevice });

    if (authorDevice.revokedAt < entry.index)
      throw new InvalidBlockError('revoked_author_error', 'device creation author is revoked', { entry });

    if (entry.nature === NATURE.device_creation_v3 && userPublicKey && entry.user_key_pair
        && !utils.equalArray(entry.user_key_pair.public_encryption_key, userPublicKey))
      throw new InvalidBlockError('invalid_public_user_key', 'public_user_key is different than the author\'s one', { entry, authorDevice });

    if (!authorUser)
      throw new InternalError('Assertion error: We have an author device, but no author user!?');

    if (!utils.equalArray(entry.user_id, authorUser.userId))
      throw new InvalidBlockError('forbidden', 'the author is not authorized to create a device for this user', { entry, authorDevice });
  } else {
    if (!tcrypto.verifySignature(delegationBuffer, entry.delegation_signature, trustchainPublicKey))
      throw new InvalidBlockError('invalid_delegation_signature', 'delegation signature is invalid, there might be a mismatch between the Trustchains configured client-side and server-side', { entry });

    if (!authorUser || authorUser.devices.length === 0)
      return;

    // If we're already verified, then it's not an error
    const entryDeviceId = utils.toBase64(entry.hash);
    if (!authorUser.devices.some(device => device.deviceId === entryDeviceId))
      throw new InvalidBlockError('forbidden', 'the user already has a device, this can\'t be the first device', { entry });
  }
}

export function verifyDeviceRevocation(entry: DeviceRevocationEntry, authorUser: User) {
  const authorDevice: Device = find(authorUser.devices, d => utils.equalArray(utils.fromBase64(d.deviceId), entry.author));

  if (!tcrypto.verifySignature(entry.hash, entry.signature, authorDevice.devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, authorUser });

  const revokedDevice = find(authorUser.devices, d => utils.equalArray(utils.fromBase64(d.deviceId), entry.device_id));
  if (!revokedDevice)
    throw new InvalidBlockError('invalid_revoked_device', 'can\'t find target of device revocation block', { entry });
  if (revokedDevice.revokedAt < entry.index)
    throw new InvalidBlockError('device_already_revoked', 'target of device_revocation block is already revoked', { entry, revokedDevice });

  if (entry.nature === NATURE.device_revocation_v1) {
    if (authorUser.userPublicKeys.length !== 0)
      throw new InvalidBlockError('invalid_revocation_version', 'cannot use a device revocation v1 if the target has a user key', { entry, authorUser });
  } else {
    const newKeys = entry.user_keys;
    if (!newKeys)
      throw new InvalidBlockError('missing_user_keys', 'missing user keys', { entry });
    const userPublicKey = getLastUserPublicKey(authorUser);
    if (userPublicKey && !utils.equalArray(newKeys.previous_public_encryption_key, userPublicKey))
      throw new InvalidBlockError('invalid_previous_key', 'previous public user encryption key does not match', { entry, authorUser });

    const activeDevices = authorUser.devices.filter(d => d.revokedAt > entry.index && d.deviceId !== utils.toBase64(entry.device_id));
    if (activeDevices.length !== newKeys.private_keys.length)
      throw new InvalidBlockError('invalid_new_key', 'device number mismatch', { entry, authorUser, activeDeviceCount: activeDevices.length, userKeysCount: newKeys.private_keys.length });
    for (const device of activeDevices) {
      const devId = utils.fromBase64(device.deviceId);
      if (findIndex(newKeys.private_keys, k => utils.equalArray(k.recipient, devId)) === -1)
        throw new InvalidBlockError('invalid_new_key', 'missing encrypted private key for an active device', { entry, authorUser });
    }
  }
}
