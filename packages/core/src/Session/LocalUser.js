// @flow
import { type DeviceType } from '../Unlock/unlock';
import { type UnlockMethods } from '../Network/Client';

export type LocalUser = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  userSecret: Uint8Array,
  clearUserId: string,
  deviceId: Uint8Array,
  deviceType: DeviceType,
  unlockMethods: UnlockMethods,
}
