import { InternalError } from '@tanker/errors';

import type { DeviceCreationEntry } from './Serialize';
import type { User, Device } from './types';

export function applyDeviceCreationToUser(deviceCreation: DeviceCreationEntry, user: User | null): User {
  let oldDevices: Array<Device> = [];
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
