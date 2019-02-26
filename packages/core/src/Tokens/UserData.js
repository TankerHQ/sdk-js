// @flow

import { utils, checkUserSecret, obfuscateUserId, type b64string } from '@tanker/crypto';
import { DEVICE_TYPE, type DeviceType } from '../Unlock/unlock';
import { InvalidUserToken } from '../errors';
import { type DelegationToken } from '../Session/delegation';

export type UserData = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  clearUserId: string,
  userSecret: Uint8Array,
  delegationToken: DelegationToken,
  deviceType: DeviceType,
}

export function extractUserData(trustchainId: Uint8Array, clearUserId: string, sessionTokenB64: b64string): UserData {
  const userId = obfuscateUserId(trustchainId, clearUserId);

  const userToken = utils.fromB64Json(sessionTokenB64);
  const deviceType = DEVICE_TYPE.client_device;

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
  };
}
