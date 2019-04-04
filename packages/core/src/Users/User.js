// @flow
import { utils, type b64string } from '@tanker/crypto';
import type { VerifiedDeviceCreation, VerifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { findIndex } from '../utils';
import { NATURE } from '../Blocks/Nature';

export type IndexUserKey = {|
  userPublicKey: Uint8Array,
  index: number,
|};

export type Device = {
  deviceId: b64string,
  devicePublicEncryptionKey: Uint8Array,
  devicePublicSignatureKey: Uint8Array,
  isGhostDevice: bool,
  isServerDevice: bool,
  createdAt: number,
  revokedAt: number,
};

export type User = {
  userId: b64string,
  userPublicKeys: Array<IndexUserKey>,
  devices: Array<Device>,
};

export function getLastUserPublicKey(user: User): ?Uint8Array {
  if (user.userPublicKeys.length === 0)
    return;
  return user.userPublicKeys.slice(-1)[0].userPublicKey;
}

export function applyDeviceCreationToUser(deviceCreation: VerifiedDeviceCreation, user: ?User) {
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
    isServerDevice: deviceCreation.is_server_device,
    revokedAt: Number.MAX_SAFE_INTEGER,
  };

  for (const existingDev of oldDevices) {
    if (existingDev.deviceId === newDevice.deviceId)
      throw new Error('Assertion error: Adding an already existing device.');
  }

  const updatedUser = {
    _id: b64Id,
    userId: b64Id,
    userPublicKeys,
    devices: [...oldDevices, newDevice],
  };

  return { updatedUser, newDevice };
}

export function applyDeviceRevocationToUser(deviceRevocation: VerifiedDeviceRevocation, user: User) {
  const b64DevId = utils.toBase64(deviceRevocation.device_id);
  const deviceIndex = findIndex(user.devices, (d) => d.deviceId === b64DevId);
  if (deviceIndex === -1)
    throw new Error('Device not found!');
  const updatedUser = { ...user };
  updatedUser.devices[deviceIndex].revokedAt = deviceRevocation.index;

  let userPublicKey;
  if (deviceRevocation.nature !== NATURE.device_revocation_v1) {
    if (!deviceRevocation.user_keys)
      throw new Error('Somehow we have a DR2 without a new user key?');
    userPublicKey = deviceRevocation.user_keys.public_encryption_key;
    user.userPublicKeys.push({ userPublicKey, index: deviceRevocation.index });
  }

  return { updatedUser, userPublicKey };
}
