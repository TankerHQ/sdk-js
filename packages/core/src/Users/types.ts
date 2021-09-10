export type Device = {
  deviceId: Uint8Array;
  devicePublicEncryptionKey: Uint8Array;
  devicePublicSignatureKey: Uint8Array;
  isGhostDevice: boolean;
  revoked: boolean;
};

export type User = {
  userId: Uint8Array;
  userPublicKeys: Array<Uint8Array>;
  devices: Array<Device>;
};

export function getLastUserPublicKey(user: User): ?Uint8Array {
  if (user.userPublicKeys.length === 0)
    return;
  return user.userPublicKeys.slice(-1)[0];
}
