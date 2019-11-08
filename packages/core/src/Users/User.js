// @flow
import { utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { findIndex } from '../utils';
import { NATURE } from '../Blocks/Nature';
import { type DeviceCreationEntry, type DeviceRevocationEntry } from './Serialize';

import type { User, Device } from './types';

export function applyDeviceCreationToUser(deviceCreation: DeviceCreationEntry, user: ?User) {
  const b64Id = utils.toBase64(deviceCreation.user_id);
  let oldDevices = [];
  let userPublicKeys = deviceCreation.user_key_pair ? [{ userPublicKey: deviceCreation.user_key_pair.public_encryption_key, index: deviceCreation.index }] : [];
  if (user) {
    oldDevices = user.devices;
    userPublicKeys = user.userPublicKeys; // eslint-disable-line prefer-destructuring
  }
  const newDevice: Device = {
    deviceId: utils.toBase64(deviceCreation.hash),
    devicePublicEncryptionKey: deviceCreation.public_encryption_key,
    devicePublicSignatureKey: deviceCreation.public_signature_key,
    createdAt: deviceCreation.index,
    isGhostDevice: deviceCreation.is_ghost_device,
    revokedAt: Number.MAX_SAFE_INTEGER,
  };

  for (const existingDev of oldDevices) {
    if (existingDev.deviceId === newDevice.deviceId)
      throw new InternalError('Assertion error: Adding an already existing device.');
  }

  const updatedUser = {
    _id: b64Id,
    userId: b64Id,
    userPublicKeys,
    devices: [...oldDevices, newDevice],
  };

  return { updatedUser, newDevice };
}

export function applyDeviceRevocationToUser(deviceRevocation: DeviceRevocationEntry, user: User) {
  const b64DevId = utils.toBase64(deviceRevocation.device_id);
  const deviceIndex = findIndex(user.devices, (d) => d.deviceId === b64DevId);
  if (deviceIndex === -1)
    throw new InternalError('Device not found!');
  const updatedUser = { ...user };
  updatedUser.devices[deviceIndex].revokedAt = deviceRevocation.index;

  let userPublicKey;
  if (deviceRevocation.nature !== NATURE.device_revocation_v1) {
    if (!deviceRevocation.user_keys)
      throw new InternalError('Somehow we have a DR2 without a new user key?');
    userPublicKey = deviceRevocation.user_keys.public_encryption_key;
    user.userPublicKeys.push({ userPublicKey, index: deviceRevocation.index });
  }

  return { updatedUser, userPublicKey };
}
