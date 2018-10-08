// @flow

import { utils } from '@tanker/crypto';

import { createUnlockKeyRequest, createDeviceFromUnlockKey, extractUnlockKey, type UnlockKey, } from './unlock';
import { InvalidUnlockPassword, InvalidUnlockKey, InvalidUnlockVerificationCode } from '../errors';

import { Client } from '../Network/Client';
import { type Block } from '../Blocks/Block';
import KeyStore from '../Session/Keystore';
import { type UserData } from '../Tokens/SessionTypes';

export class Unlocker {
  _userData: UserData;
  _keyStore: KeyStore;
  _client: Client;

  constructor(userData: UserData, keystore: KeyStore, client: Client) {
    this._keyStore = keystore;
    this._userData = userData;
    this._client = client;
  }

  async _fetchUnlockKey(password: ?string, verificationCode: ?string): Promise<UnlockKey> {
    try {
      const answer = await this._client.fetchUnlockKey(createUnlockKeyRequest({
        trustchainId: this._userData.trustchainId,
        userId: this._userData.userId,
        password,
        verificationCode,
      }));

      return answer.getUnlockKey(this._userData.userSecret);
    } catch (e) {
      if (e.error && e.error.status) {
        if (e.error.status === 401) {
          if (password) {
            throw new InvalidUnlockPassword(e);
          } else {
            throw new InvalidUnlockVerificationCode(e);
          }
        } else if (e.error.status === 404) {
          throw new InvalidUnlockKey(e);
        }
      }
      throw e;
    }
  }

  _createDeviceWithUnlockKey = async (unlockKey: UnlockKey): Promise<Block> => {
    const ghostDevice = extractUnlockKey(unlockKey);
    const encryptedUserKey = await this._client.getLastUserKey(
      this._userData.trustchainId,
      utils.toBase64(ghostDevice.deviceId),
    );
    return createDeviceFromUnlockKey({
      trustchainId: this._userData.trustchainId,
      userId: this._userData.userId,
      deviceKeys: this._keyStore.deviceKeys,
      ghostDevice,
      encryptedUserKey,
      deviceType: this._userData.deviceType,
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

  deviceValidationCode = () => {
    const identity = this._keyStore.getIdentity();
    identity.userId = utils.toBase64(this._userData.userId);
    return utils.toB64Json(identity);
  }
}
