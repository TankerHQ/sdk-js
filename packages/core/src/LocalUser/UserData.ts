import type { b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import { _deserializePermanentIdentity, assertUserSecret } from '../Identity';

export type DelegationToken = {
  ephemeral_public_signature_key: Uint8Array;
  ephemeral_private_signature_key: Uint8Array;
  user_id: Uint8Array;
  delegation_signature: Uint8Array;
  last_reset: Uint8Array;
};

export type UserData = {
  trustchainId: Uint8Array;
  userId: Uint8Array;
  userSecret: Uint8Array;
  delegationToken: DelegationToken;
};

export function extractUserData(identityB64: b64string): UserData {
  // Note: already throws detailed InvalidArgument errors
  const identity = _deserializePermanentIdentity(identityB64);

  try {
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
  } catch (e) {
    throw new InvalidArgument(`Invalid identity provided: ${identityB64}`);
  }
}
