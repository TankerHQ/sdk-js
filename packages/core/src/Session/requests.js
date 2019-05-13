// @flow

import { generichash, utils } from '@tanker/crypto';

import LocalUser from './LocalUser';
import { Client } from '../Network/Client';

import { InvalidUnlockPassword, InvalidUnlockKey, InvalidVerificationCode, MaxVerificationAttemptsReached, ServerError } from '../errors';

const createUnlockKeyRequest = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  password: ?string,
  verificationCode: ?string
) => {
  const msg = () => {
    if (password) {
      return {
        type: 'password',
        value: generichash(utils.fromString(password)),
      };
    } else if (verificationCode) {
      return {
        type: 'verification_code',
        value: utils.fromSafeBase64(verificationCode),
      };
    } else {
      throw new Error('wrong unlock request type provided');
    }
  };
  return {
    trustchainId,
    userId,
    ...msg(),
  };
};

export const fetchUnlockKey = async (localUser: LocalUser, client: Client, password: ?string, verificationCode: ?string) => {
  try {
    const request = createUnlockKeyRequest(
      localUser.trustchainId,
      localUser.userId,
      password,
      verificationCode,
    );
    const answer = await client.fetchUnlockKey(request);

    return answer.getUnlockKey(localUser.userSecret);
  } catch (e) {
    if (e instanceof ServerError) {
      if (e.error.code === 'authentication_failed') {
        if (password) {
          throw new InvalidUnlockPassword(e);
        } else {
          throw new InvalidVerificationCode(e);
        }
      } else if (e.error.code === 'user_unlock_key_not_found') {
        throw new InvalidUnlockKey(e);
      } else if (e.error.code === 'max_attempts_reached') {
        throw new MaxVerificationAttemptsReached(e);
      }
    }
    throw e;
  }
};

export const getLastUserKey = async (client: Client, trustchainId: Uint8Array, deviceId: Uint8Array) => {
  const encryptedUserKey = await client.getLastUserKey(
    trustchainId,
    utils.toBase64(deviceId),
  );
  if (!encryptedUserKey)
    throw new Error('Assersion error: no user key');

  return encryptedUserKey;
};
