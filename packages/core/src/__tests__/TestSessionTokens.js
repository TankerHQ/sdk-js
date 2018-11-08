// @flow
import { tcrypto, utils, obfuscateUserId, createUserSecretB64 } from '@tanker/crypto';
import { generateUnlockKeyRegistration, DEVICE_TYPE } from '../Unlock/unlock';

export function createUserTokenFromSecret(userId: Uint8Array, trustchainPrivateKey: Uint8Array, userSecret: string) {
  const ephemeralKeys = tcrypto.makeSignKeyPair();
  const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, userId);

  const userToken = {
    delegation_signature: utils.toBase64(tcrypto.sign(delegationBuffer, trustchainPrivateKey)),
    ephemeral_private_signature_key: utils.toBase64(ephemeralKeys.privateKey),
    ephemeral_public_signature_key: utils.toBase64(ephemeralKeys.publicKey),
    user_id: utils.toBase64(userId),
    user_secret: userSecret,
  };

  return utils.toB64Json(userToken);
}

export function createUserToken(trustchainId: Uint8Array, userIdString: string, trustchainPrivateKey: Uint8Array) {
  const userId = obfuscateUserId(trustchainId, userIdString);
  const userSecret = createUserSecretB64(utils.toBase64(trustchainId), userIdString);
  return createUserTokenFromSecret(userId, trustchainPrivateKey, userSecret);
}

export function createServerToken(trustchainId: Uint8Array, trustchainPrivateKey: Uint8Array, serverId: string) {
  const userKeys = tcrypto.makeEncryptionKeyPair();
  const obfuscatedServerId = obfuscateUserId(trustchainId, serverId);

  const unlockKeyRegistration = generateUnlockKeyRegistration({
    trustchainId,
    userId: obfuscatedServerId,
    userKeys,
    deviceType: DEVICE_TYPE.server_device,
    authorDevice: {
      id: trustchainId,
      privateSignatureKey: trustchainPrivateKey,
    }
  });
  const userToken = createUserToken(trustchainId, serverId, trustchainPrivateKey);
  return utils.toB64Json({
    version: 1,
    type: 'serverToken',
    settings: {
      userToken,
      unlockKey: unlockKeyRegistration.unlockKey,
    },
  });
}
