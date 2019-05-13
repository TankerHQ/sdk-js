// @flow

import { utils, type b64string } from '@tanker/crypto';
import { _deserializePermanentIdentity, assertUserSecret } from '@tanker/identity';
import { type DelegationToken, type UserData } from './Session/types';

export function extractUserData(identityB64: b64string): UserData {
  const identity = _deserializePermanentIdentity(identityB64);

  const userId = utils.fromBase64(identity.value);
  const userSecret = utils.fromBase64(identity.user_secret);
  const trustchainId = utils.fromBase64(identity.trustchain_id);

  const delegationToken: DelegationToken = {
    ephemeral_public_signature_key: utils.fromBase64(identity.ephemeral_public_signature_key),
    ephemeral_private_signature_key: utils.fromBase64(identity.ephemeral_private_signature_key),
    user_id: userId,
    delegation_signature: utils.fromBase64(identity.delegation_signature),
    last_reset: new Uint8Array(32),
  };

  assertUserSecret(userId, userSecret);

  return {
    trustchainId,
    userId,
    userSecret,
    delegationToken,
  };
}
