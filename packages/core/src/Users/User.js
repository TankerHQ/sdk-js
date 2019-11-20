// @flow
import { utils, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { findIndex } from '../utils';
import { NATURE } from '../Blocks/Nature';
import { unserializeBlock } from '../Blocks/payloads';

import { type DeviceCreationEntry, type DeviceRevocationEntry, isDeviceCreation, deviceCreationFromBlock, isDeviceRevocation, deviceRevocationFromBlock } from './Serialize';

import type { User, Device } from './types';
import { verifyDeviceCreation, verifyDeviceRevocation } from './Verify';

export function applyDeviceCreationToUser(deviceCreation: DeviceCreationEntry, user: ?User): User {
  let oldDevices = [];
  let userPublicKeys = deviceCreation.user_key_pair ? [{ userPublicKey: deviceCreation.user_key_pair.public_encryption_key, index: deviceCreation.index }] : [];
  if (user) {
    oldDevices = user.devices;
    userPublicKeys = user.userPublicKeys; // eslint-disable-line prefer-destructuring
  }
  const newDevice: Device = {
    deviceId: deviceCreation.hash,
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

  return {
    userId: deviceCreation.user_id,
    userPublicKeys,
    devices: [...oldDevices, newDevice],
  };
}

export function applyDeviceRevocationToUser(deviceRevocation: DeviceRevocationEntry, user: User): User {
  const deviceIndex = findIndex(user.devices, (d) => utils.equalArray(d.deviceId, deviceRevocation.device_id));
  if (deviceIndex === -1)
    throw new InternalError('Device not found!');
  const updatedUser = { ...user };
  updatedUser.devices[deviceIndex].revokedAt = deviceRevocation.index;

  let userPublicKey;
  if (deviceRevocation.nature !== NATURE.device_revocation_v1) {
    if (!deviceRevocation.user_keys)
      throw new InternalError('Somehow we have a DR2 without a new user key?');
    userPublicKey = deviceRevocation.user_keys.public_encryption_key;
    updatedUser.userPublicKeys.push({ userPublicKey, index: deviceRevocation.index });
  }

  return updatedUser;
}

export function userFromBlocks(userBlocks: Array<b64string>, trustchainPublicKey: Uint8Array): User {
  let user = null;
  userBlocks.forEach(b => {
    const block = unserializeBlock(utils.fromBase64(b));
    if (isDeviceCreation(block)) {
      const deviceCreation = deviceCreationFromBlock(block);
      verifyDeviceCreation(deviceCreation, user, trustchainPublicKey);
      user = applyDeviceCreationToUser(deviceCreation, user);
    } else if (isDeviceRevocation(block)) {
      if (!user) {
        throw new InternalError('Assertion error: Cannot revoke device of non existing user');
      }
      const deviceRevocation = deviceRevocationFromBlock(block, user.userId);
      verifyDeviceRevocation(deviceRevocation, user);
      user = applyDeviceRevocationToUser(deviceRevocation, user);
    }
  });
  if (!user) {
    throw new InternalError('Assertion error: user cannot be null');
  }
  return user;
}
