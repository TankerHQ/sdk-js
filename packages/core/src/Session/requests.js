// @flow

import { generichash, utils, tcrypto } from '@tanker/crypto';

import { encrypt } from '../DataProtection/Encryptors/v2';

import { type Block } from '../Blocks/Block';
import { Client, b64RequestObject } from '../Network/Client';

import LocalUser from './LocalUser';
import { type UserCreation } from './deviceCreation';
import { type Verification } from './types';
import { type GhostDevice } from './ghostDevice';


import { InvalidPassphrase, InvalidUnlockKey, InvalidVerificationCode, MaxVerificationAttemptsReached, ServerError } from '../errors';

type VerificationRequest = {|
  passphrase: Uint8Array,
|} | {|
  email: string,
  encrypted_email: Uint8Array,
  verification_code: string,
|};

type UserCreationRequest = {|
  trustchain_id: Uint8Array,
  user_id: Uint8Array,
  user_creation_block: Block,
  first_device_block: Block,
  encrypted_unlock_key?: Uint8Array,
  verification?: VerificationRequest
|};

const wrapVerificationErrors = async (promise: Promise<any>, verification: Verification): * => {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof ServerError) {
      if (e.error.code === 'invalid_verification_code') {
        throw new InvalidVerificationCode(e);
      } else if (e.error.code === 'max_attempts_reached') {
        throw new MaxVerificationAttemptsReached(e);
      } else if (e.error.code === 'authentication_failed' || e.error.code === 'user_unlock_key_not_found') {
        if (verification.passphrase) {
          throw new InvalidPassphrase(e);
        } else {
          throw new InvalidVerificationCode(e);
        }
      }
    }
    throw e;
  }
};

const doFetchUnlockKey = async (localUser: LocalUser, client: Client, verification: Verification): Promise<Uint8Array> => {
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
};

export const fetchUnlockKey = (localUser: LocalUser, client: Client, verification: Verification): Promise<Uint8Array> => wrapVerificationErrors(
  doFetchUnlockKey(localUser, client, verification),
  verification,
);

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

const doSendUserCreation = async (client: Client, localUser: LocalUser, userCreation: UserCreation, firstDevice: Block, verification: Verification, encryptedUnlockKey: Uint8Array) => {
  const request: UserCreationRequest = {
    trustchain_id: localUser.trustchainId,
    user_id: localUser.userId,
    user_creation_block: userCreation.userCreationBlock,
    first_device_block: firstDevice,
  };

  if (verification.email) {
    request.encrypted_unlock_key = encryptedUnlockKey;
    request.verification = {
      email: verification.email,
      encrypted_email: encrypt(localUser.userSecret, utils.fromString(verification.email)),
      verification_code: verification.verificationCode
    };
  } else if (verification.passphrase) {
    request.encrypted_unlock_key = encryptedUnlockKey;
    request.verification = {
      passphrase: generichash(utils.fromString(verification.passphrase)),
    };
  }

  await client.send('create user', b64RequestObject(request));
};

export const sendUserCreation = (client: Client, localUser: LocalUser, userCreation: UserCreation, firstDevice: Block, verification: Verification, encryptedUnlockKey: Uint8Array) => wrapVerificationErrors(
  doSendUserCreation(client, localUser, userCreation, firstDevice, verification, encryptedUnlockKey),
  verification,
);

const doSendUpdateVerificationMethod = async (client: Client, localUser: LocalUser, verification: Verification) => {
  const request = {};

  if (verification.email) {
    request.verification = {
      email: verification.email,
      encrypted_email: encrypt(localUser.userSecret, utils.fromString(verification.email)),
      verification_code: verification.verificationCode,
    };
  } else if (verification.passphrase) {
    request.verification = {
      passphrase: generichash(utils.fromString(verification.passphrase)),
    };
  }

  await client.send('update verification method', b64RequestObject(request));
};

export const sendUpdateVerificationMethod = (client: Client, localUser: LocalUser, verification: Verification) => wrapVerificationErrors(
  doSendUpdateVerificationMethod(client, localUser, verification),
  verification,
);
