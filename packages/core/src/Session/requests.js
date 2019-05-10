// @flow

import { generichash, utils, tcrypto } from '@tanker/crypto';

import { type Block } from '../Blocks/Block';
import { Client, b64RequestObject } from '../Network/Client';

import LocalUser from './LocalUser';
import { type UserCreation } from './deviceCreation';
import { type Verification } from './types';
import { type GhostDevice } from './ghostDevice';


import { InvalidPassphrase, InvalidUnlockKey, InvalidVerificationCode, MaxVerificationAttemptsReached, ServerError } from '../errors';

type VerificationRequest = {|
  encrypted_unlock_key: Uint8Array,
  passphrase: Uint8Array,
|} | {|
  encrypted_unlock_key: Uint8Array,
  email: string,
  verification_code: string,
|};

type UserCreationRequest = {|
  trustchain_id: Uint8Array,
  user_id: Uint8Array,
  user_creation_block: Block,
  first_device_block: Block,
  verification_method?: VerificationRequest
|};

export const fetchUnlockKey = async (localUser: LocalUser, client: Client, verification: Verification): Promise<Uint8Array> => {
  try {
    let request;

    if (verification.email) {
      request = {
        trustchain_id: localUser.trustchainId,
        user_id: localUser.userId,
        type: 'verification_code',
        value: verification.verificationCode,
      };
    } else if (verification.passphrase) {
      request = {
        trustchain_id: localUser.trustchainId,
        user_id: localUser.userId,
        type: 'password',
        value: generichash(utils.fromString(verification.passphrase)),
      };
    }

    const res = await client.send('get unlock key', b64RequestObject(request));
    return utils.fromBase64(res.encrypted_unlock_key);
  } catch (e) {
    if (e instanceof ServerError) {
      if (e.error.code === 'authentication_failed'
      || e.error.code === 'user_unlock_key_not_found') {
        if (verification.passphrase) {
          throw new InvalidPassphrase(e);
        } else {
          throw new InvalidVerificationCode(e);
        }
      } else if (e.error.code === 'max_attempts_reached') {
        throw new MaxVerificationAttemptsReached(e);
      }
    }
    throw e;
  }
};

export const getLastUserKey = async (client: Client, trustchainId: Uint8Array, ghostDevice: GhostDevice) => {
  try {
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
  } catch (e) {
    if (e instanceof ServerError && e.error.code !== 'internal_error') {
      throw new InvalidUnlockKey(e);
    }
    throw e;
  }
};

export const sendUserCreation = async (client: Client, localUser: LocalUser, userCreation: UserCreation, firstDevice: Block, verification: Verification, encryptedUnlockKey: Uint8Array) => {
  const userCreationRequest: UserCreationRequest = {
    trustchain_id: localUser.trustchainId,
    user_id: localUser.userId,
    user_creation_block: userCreation.userCreationBlock,
    first_device_block: firstDevice,
  };

  if (verification.email) {
    userCreationRequest.verification_method = {
      encrypted_unlock_key: encryptedUnlockKey,
      email: verification.email,
      verification_code: verification.verificationCode
    };
  } else if (verification.passphrase) {
    userCreationRequest.verification_method = {
      encrypted_unlock_key: encryptedUnlockKey,
      passphrase: generichash(utils.fromString(verification.passphrase)),
    };
  }

  await client.send('create user', b64RequestObject(userCreationRequest));
};

export const sendUnlockUpdate = async (client: Client, localUser: LocalUser, verification: Verification) => {
  let signatureBuffer = utils.concatArrays(localUser.trustchainId, localUser.deviceId);
  let claims;

  if (verification.email) {
    const emailArray = utils.fromString(verification.email);
    signatureBuffer = utils.concatArrays(signatureBuffer, emailArray);
    claims = { email: emailArray };
  } else if (verification.passphrase) {
    const hashedPassphrase = generichash(utils.fromString(verification.passphrase));
    signatureBuffer = utils.concatArrays(signatureBuffer, hashedPassphrase);
    claims = { password: hashedPassphrase };
  } else {
    throw new Error('Invalid verification method for createUnlockKeyRequest');
  }

  const signature = tcrypto.sign(signatureBuffer, localUser.privateSignatureKey);
  const request = {
    trustchain_id: localUser.trustchainId,
    device_id: localUser.deviceId,
    claims,
    signature,
  };
  await client.send('update unlock key', b64RequestObject(request));
};
