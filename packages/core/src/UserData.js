// @flow

import { utils, checkUserSecret, type b64string } from '@tanker/crypto';
import { DEVICE_TYPE, type DeviceType } from './Unlock/unlock';
import { InvalidIdentity } from './errors';
import { type DelegationToken } from './Session/delegation';

export type UserData = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  userSecret: Uint8Array,
  delegationToken: DelegationToken,
  deviceType: DeviceType,
}

export function extractUserData(identityB64: b64string): UserData {
  let identity;
  const deviceType = DEVICE_TYPE.client_device;
  try {
    identity = utils.fromB64Json(identityB64);
  } catch (e) {
    throw new InvalidIdentity(e);
  }
  const userId = utils.fromBase64(identity.user_id);

  const userSecret = utils.fromBase64(identity.user_secret);

  const trustchainId = utils.fromBase64(identity.trustchain_id);

  const delegationToken: DelegationToken = {
    ephemeral_public_signature_key: utils.fromBase64(identity.ephemeral_public_signature_key),
    ephemeral_private_signature_key: utils.fromBase64(identity.ephemeral_private_signature_key),
    user_id: userId,
    delegation_signature: utils.fromBase64(identity.delegation_signature),
    last_reset: new Uint8Array(32),
  };

  try {
    checkUserSecret(userId, userSecret);
  } catch (e) {
    throw new InvalidIdentity(e);
  }
  return {
    trustchainId,
    userId,
    userSecret,
    delegationToken,
    deviceType,
  };
}
