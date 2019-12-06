// @flow

import { generichash, utils, tcrypto, encryptionV2 } from '@tanker/crypto';
import { DecryptionFailed, InternalError } from '@tanker/errors';

import { type Block } from '../Blocks/Block';
import { Client, b64RequestObject } from '../Network/Client';

import LocalUser from './LocalUser/LocalUser';
import { type UserCreation } from './LocalUser/deviceCreation';
import { type Verification, type RemoteVerification } from './types';
import { type GhostDevice } from './LocalUser/ghostDevice';

type VerificationRequest = $Exact<{
  hashed_passphrase: Uint8Array,
}> | $Exact<{
  hashed_email: Uint8Array,
  encrypted_email: Uint8Array,
  verification_code: string,
}> | $Exact<{
  oidc_id_token: string,
}>;

type UserCreationRequest = $Exact<{
  trustchain_id: Uint8Array,
  user_id: Uint8Array,
  user_creation_block: Block,
  first_device_block: Block,
  encrypted_unlock_key?: Uint8Array,
  verification?: VerificationRequest
}>;

type GetVerificationKeyRequest = $Exact<{
  trustchain_id: Uint8Array,
  user_id: Uint8Array,
  verification: VerificationRequest
}>;

export const formatVerificationRequest = (verification: RemoteVerification, localUser: LocalUser): VerificationRequest => {
  if (verification.email) {
    return {
      hashed_email: generichash(utils.fromString(verification.email)),
      encrypted_email: encryptionV2.compatEncrypt(localUser.userSecret, utils.fromString(verification.email)),
      verification_code: verification.verificationCode,
    };
  }
  if (verification.passphrase) {
    return {
      hashed_passphrase: generichash(utils.fromString(verification.passphrase)),
    };
  }
  if (verification.oidcIdToken) {
    return {
      oidc_id_token: verification.oidcIdToken,
    };
  }
  throw new InternalError('Assertion error: invalid remote verification in formatVerificationRequest');
};

export const sendGetVerificationKey = async (localUser: LocalUser, client: Client, verification: RemoteVerification): Promise<Uint8Array> => {
  const request: GetVerificationKeyRequest = {
    trustchain_id: localUser.trustchainId,
    user_id: localUser.userId,
    verification: formatVerificationRequest(verification, localUser),
  };

  const result = await client.send('get verification key', b64RequestObject(request));
  return utils.fromBase64(result.encrypted_verification_key);
};

export const getLastUserKey = async (client: Client, trustchainId: Uint8Array, ghostDevice: GhostDevice) => {
  const signatureKeyPair = tcrypto.getSignatureKeyPairFromPrivateKey(ghostDevice.privateSignatureKey);
  const request = {
    trustchain_id: trustchainId,
    device_public_signature_key: signatureKeyPair.publicKey,
  };

  const reply = await client.send('last user key', b64RequestObject(request));

  return {
    encryptedPrivateUserKey: utils.fromBase64(reply.encrypted_private_user_key),
    deviceId: utils.fromBase64(reply.device_id),
  };
};

export const sendUserCreation = async (client: Client, localUser: LocalUser, userCreation: UserCreation, firstDevice: Block, verification: Verification, encryptedUnlockKey: Uint8Array) => {
  const request: UserCreationRequest = {
    trustchain_id: localUser.trustchainId,
    user_id: localUser.userId,
    user_creation_block: userCreation.userCreationBlock,
    first_device_block: firstDevice,
  };

  if (verification.email || verification.passphrase || verification.oidcIdToken) {
    request.encrypted_unlock_key = encryptedUnlockKey;
    request.verification = formatVerificationRequest(verification, localUser);
  }

  await client.send('create user', b64RequestObject(request));
};

export const sendSetVerificationMethod = async (client: Client, localUser: LocalUser, verification: RemoteVerification) => {
  const request = {
    verification: formatVerificationRequest(verification, localUser),
  };

  await client.send('set verification method', b64RequestObject(request));
};

export const getVerificationMethods = async (client: Client, localUser: LocalUser) => {
  const request = {
    trustchain_id: localUser.trustchainId,
    user_id: localUser.userId,
  };

  const res = await client.send('get verification methods', b64RequestObject(request));

  return res.verification_methods.map(verificationMethod => {
    const method = { ...verificationMethod };

    // Compat: email value might be missing if unlock method registered with SDK < 2.0.0
    if (method.type === 'email' && method.encrypted_email) {
      const encryptedEmail = utils.fromBase64(method.encrypted_email);
      if (encryptedEmail.length < encryptionV2.overhead) {
        throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${encryptionV2.overhead} for encryption v2` });
      }
      method.email = utils.toString(encryptionV2.compatDecrypt(localUser.userSecret, encryptedEmail));
      delete method.encrypted_email;
    } else if (method.type === 'oidc_id_token') {
      return { type: 'oidcIdToken' };
    }

    return method;
  });
};
