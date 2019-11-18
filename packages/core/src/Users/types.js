// @flow
import { type b64string } from '@tanker/crypto';

export type IndexUserKey = {|
  userPublicKey: Uint8Array,
  index: number,
|};

export type Device = {
  deviceId: b64string,
  devicePublicEncryptionKey: Uint8Array,
  devicePublicSignatureKey: Uint8Array,
  isGhostDevice: bool,
  createdAt: number,
  revokedAt: number,
};

export type User = {
  userId: Uint8Array,
  userPublicKeys: Array<IndexUserKey>,
  devices: Array<Device>,
};

export function getLastUserPublicKey(user: User): ?Uint8Array {
  if (user.userPublicKeys.length === 0)
    return;
  return user.userPublicKeys.slice(-1)[0].userPublicKey;
}
