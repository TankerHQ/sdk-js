// @flow

import { utils } from '@tanker/crypto';

import { createUnlockKeyRequest, createDeviceFromUnlockKey, extractUnlockKey, type UnlockKey, } from './unlock';
import { InvalidUnlockPassword, InvalidUnlockKey, InvalidUnlockVerificationCode, MaxVerificationAttemptsReached, ServerError } from '../errors';

import { Client } from '../Network/Client';
import { type Block } from '../Blocks/Block';
import LocalUser from '../Session/LocalUser';

export class Unlocker {
  _localUser: LocalUser;
  _client: Client;

  constructor(localUser: LocalUser, client: Client) {
    this._localUser = localUser;
    this._client = client;
  }

  async _fetchUnlockKey(password: ?string, verificationCode: ?string): Promise<UnlockKey> {
    try {
      const answer = await this._client.fetchUnlockKey(createUnlockKeyRequest({
        trustchainId: this._localUser.trustchainId,
        userId: this._localUser.userId,
        password,
        verificationCode,
      }));

      return answer.getUnlockKey(this._localUser.userSecret);
    } catch (e) {
      if (e instanceof ServerError) {
        if (e.error.code === 'authentication_failed') {
          if (password) {
            throw new InvalidUnlockPassword(e);
          } else {
            throw new InvalidUnlockVerificationCode(e);
          }
        } else if (e.error.code === 'user_unlock_key_not_found') {
          throw new InvalidUnlockKey(e);
        } else if (e.error.code === 'max_attempts_reached') {
          throw new MaxVerificationAttemptsReached(e);
        }
      }
      throw e;
    }
  }

  _createDeviceWithUnlockKey = async (unlockKey: UnlockKey): Promise<Block> => {
    const ghostDevice = extractUnlockKey(unlockKey);
    const encryptedUserKey = await this._client.getLastUserKey(
      this._localUser.trustchainId,
      utils.toBase64(ghostDevice.deviceId),
    );
    if (!encryptedUserKey)
      throw new Error('Assersion error: no user key');

    return createDeviceFromUnlockKey({
      trustchainId: this._localUser.trustchainId,
      userId: this._localUser.userId,
      deviceKeys: this._localUser.deviceKeys(),
      ghostDevice,
      encryptedUserKey,
      deviceType: this._localUser.deviceType,
    });
  }

  unlockWithUnlockKey = async (unlockKey: UnlockKey) => {
    const block = await this._createDeviceWithUnlockKey(unlockKey);
    return this._client.sendBlock(block);
  }

  unlockWithPassword = async (password: ?string, verificationCode: ?string) => {
    const key = await this._fetchUnlockKey(password, verificationCode);
    return this.unlockWithUnlockKey(key);
  }
}
