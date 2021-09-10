import { utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { NATURE } from '../Blocks/Nature';

import type { DeviceCreationEntry, DeviceRevocationEntry } from './Serialize';
import type { User, Device } from './types';

export function applyDeviceCreationToUser(deviceCreation: DeviceCreationEntry, user: ?User): User {
  let oldDevices = [];
  let userPublicKeys = [deviceCreation.user_key_pair.public_encryption_key];

  if (user) {
    oldDevices = user.devices;
    userPublicKeys = user.userPublicKeys; // eslint-disable-line prefer-destructuring
  }
  const newDevice: Device = {
    deviceId: deviceCreation.hash,
    devicePublicEncryptionKey: deviceCreation.public_encryption_key,
    devicePublicSignatureKey: deviceCreation.public_signature_key,
    isGhostDevice: deviceCreation.is_ghost_device,
    revoked: false,
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
  const deviceIndex = user.devices.findIndex(d => utils.equalArray(d.deviceId, deviceRevocation.device_id));
  if (deviceIndex === -1)
    throw new InternalError('Device not found!');
  const updatedUser = { ...user };
  updatedUser.devices[deviceIndex].revoked = true;

  let userPublicKey;
  if (deviceRevocation.nature !== NATURE.device_revocation_v1) {
    if (!deviceRevocation.user_keys)
      throw new InternalError('Somehow we have a DR2 without a new user key?');
    userPublicKey = deviceRevocation.user_keys.public_encryption_key;
    updatedUser.userPublicKeys.push(userPublicKey);
  }

  return updatedUser;
}
