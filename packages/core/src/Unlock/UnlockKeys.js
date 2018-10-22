// @flow

import { utils, type b64string } from '@tanker/crypto';

import { generateUnlockKeyRegistration, createUnlockKeyMessage, createDeviceFromValidationCode, type UnlockKey, type UnlockKeyMessage } from './unlock';

import { Client } from '../Network/Client';
import KeyStore from '../Session/Keystore';
import { type SessionData } from '../Tokens/SessionTypes';


export class UnlockKeys {
  _sessionData: SessionData;
  _keyStore: KeyStore;
  _client: Client;

  constructor(sessionData: SessionData, keystore: KeyStore, client: Client) {
    this._keyStore = keystore;
    this._sessionData = sessionData;
    this._client = client;
  }

  _generateUnlockKey = () => generateUnlockKeyRegistration({
    trustchainId: this._sessionData.trustchainId,
    userId: this._sessionData.userId,
    userKeys: this._keyStore.currentUserKey,
    deviceType: this._sessionData.deviceType,
    authorDevice: {
      id: this._sessionData.deviceId,
      privateSignatureKey: this._keyStore.privateSignatureKey,
      privateEncryptionKey: this._keyStore.privateEncryptionKey,
    }
  });

  generateAndRegisterUnlockKey = async (): Promise<UnlockKey> => {
    const reg = this._generateUnlockKey();
    await this._client.sendBlock(reg.block);
    return reg.unlockKey;
  }

  _createUnlockKeyMessage = (password: ?string, email: ?string, unlockKey: ?string): Promise<UnlockKeyMessage> => createUnlockKeyMessage({
    trustchainId: utils.toBase64(this._sessionData.trustchainId),
    deviceId: utils.toBase64(this._sessionData.deviceId),
    email,
    password,
    unlockKey,
    userSecret: this._sessionData.userSecret,
    privateSigKey: this._keyStore.privateSignatureKey
  });

  _updateSessionData = (password: ?string, email: ?string): void => {
    if (password && !this._sessionData.unlockMethods.some((m) => m.type === 'password')) {
      this._sessionData.unlockMethods.push({ type: 'password' });
    }
    if (email && !this._sessionData.unlockMethods.some((m) => m.type === 'email')) {
      this._sessionData.unlockMethods.push({ type: 'email' });
    }
  }

  registerUnlock = async (password: ?string, email: ?string): Promise<void> => {
    const isFirstRegister = this._sessionData.unlockMethods.length === 0;
    let block = null;
    let unlockKey = null;

    if (isFirstRegister) {
      ({ block, unlockKey } = this._generateUnlockKey());
    }

    const msg = await this._createUnlockKeyMessage(password, email, unlockKey);

    if (block) {
      await this._client.sendBlock(block);
      await this._client.createUnlockKey(msg);
    } else {
      await this._client.updateUnlockKey(msg);
    }

    this._updateSessionData(password, email);
  }

  acceptDevice = async (validationCode: b64string): Promise<void> => {
    const block = createDeviceFromValidationCode({
      trustchainId: this._sessionData.trustchainId,
      userId: this._sessionData.userId,
      deviceKeys: this._keyStore.deviceKeys,
      userKeys: this._keyStore.userKeys.slice(-1)[0],
      validationCode
    });
    await this._client.sendBlock(block);
  }
}
