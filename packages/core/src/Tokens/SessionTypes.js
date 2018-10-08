// @flow

import { utils, checkUserSecret, obfuscateUserId, type b64string } from '@tanker/crypto';
import { type UserToken } from './UserToken';
import { isServerToken, extractFromServerToken, type ServerToken } from './ServerToken';
import { DEVICE_TYPE, type DeviceType } from '../Unlock/unlock';
import { InvalidUserToken } from '../errors';
import { type DelegationToken } from '../Session/delegation';
import { type UnlockMethods } from '../Network/Client';

export type UserData = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  clearUserId: string,
  userSecret: Uint8Array,
  delegationToken: DelegationToken,
  deviceType: DeviceType,
  unlockKey: ?string
}

export type SessionData = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  userSecret: Uint8Array,
  clearUserId: string,
  deviceId: Uint8Array,
  deviceType: DeviceType,
  unlockMethods: UnlockMethods,
}

export function extractUserData(trustchainId: Uint8Array, clearUserId: string, sessionTokenB64: b64string): UserData {
  const userId = obfuscateUserId(trustchainId, clearUserId);

  let userToken: UserToken;
  let deviceType;
  let unlock;

  if (isServerToken(sessionTokenB64)) {
    const serverToken: ServerToken = utils.fromB64Json(sessionTokenB64);
    deviceType = DEVICE_TYPE.server_device;
    const extractedServerToken = extractFromServerToken(serverToken);
    userToken = utils.fromB64Json(extractedServerToken.userToken);
    unlock = extractedServerToken.unlockKey;
  } else {
    userToken = utils.fromB64Json(sessionTokenB64);
    deviceType = DEVICE_TYPE.client_device;
  }

  const userSecret = utils.fromBase64(userToken.user_secret);

  const delegationToken: DelegationToken = {
    ephemeral_public_signature_key: utils.fromBase64(userToken.ephemeral_public_signature_key),
    ephemeral_private_signature_key: utils.fromBase64(userToken.ephemeral_private_signature_key),
    user_id: utils.fromBase64(userToken.user_id),
    delegation_signature: utils.fromBase64(userToken.delegation_signature),
    last_reset: new Uint8Array(32),
  };

  try {
    checkUserSecret(userId, userSecret);
  } catch (e) {
    throw new InvalidUserToken(e);
  }
  return {
    trustchainId,
    userId,
    clearUserId,
    userSecret,
    delegationToken,
    deviceType,
    unlockKey: unlock,
  };
}
