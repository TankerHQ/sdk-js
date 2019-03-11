// @flow
import { tcrypto, utils, obfuscateUserId, createUserSecretB64 } from '@tanker/crypto';

export function createIdentityFromSecret(trustchainId: Uint8Array, userId: Uint8Array, trustchainPrivateKey: Uint8Array, userSecret: string) {
  const ephemeralKeys = tcrypto.makeSignKeyPair();
  const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, userId);

  const identity = {
    trustchain_id: utils.toBase64(trustchainId),
    target: 'user',
    value: utils.toBase64(userId),
    delegation_signature: utils.toBase64(tcrypto.sign(delegationBuffer, trustchainPrivateKey)),
    ephemeral_private_signature_key: utils.toBase64(ephemeralKeys.privateKey),
    ephemeral_public_signature_key: utils.toBase64(ephemeralKeys.publicKey),
    user_secret: userSecret,
  };

  return utils.toB64Json(identity);
}

export function createIdentity(trustchainId: Uint8Array, userIdString: string, trustchainPrivateKey: Uint8Array) {
  const userId = obfuscateUserId(trustchainId, userIdString);
  const userSecret = createUserSecretB64(utils.toBase64(trustchainId), userIdString);
  return createIdentityFromSecret(trustchainId, userId, trustchainPrivateKey, userSecret);
}
