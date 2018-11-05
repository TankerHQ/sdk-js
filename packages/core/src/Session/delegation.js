// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';

import { type UserToken } from '../Tokens/UserToken';

export type DelegationToken = {
  ephemeral_public_signature_key: Uint8Array,
  ephemeral_private_signature_key: Uint8Array,
  user_id: Uint8Array,
  delegation_signature: Uint8Array,
  last_reset: Uint8Array,
}

export function createUserToken(userId: Uint8Array, trustchainPrivateKey: Uint8Array, userSecret: string): b64string {
  const ephemeralKeys = tcrypto.makeSignKeyPair();
  const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, userId);

  const userToken: UserToken = {
    delegation_signature: utils.toBase64(tcrypto.sign(delegationBuffer, trustchainPrivateKey)),
    ephemeral_private_signature_key: utils.toBase64(ephemeralKeys.privateKey),
    ephemeral_public_signature_key: utils.toBase64(ephemeralKeys.publicKey),
    user_id: utils.toBase64(userId),
    user_secret: userSecret,
  };

  return utils.toB64Json(userToken);
}
