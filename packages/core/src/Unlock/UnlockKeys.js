// @flow

import { utils, type b64string } from '@tanker/crypto';

import { generateUnlockKeyRegistration, createUnlockKeyMessage, createDeviceFromValidationCode, type UnlockKey, } from './unlock';

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

  updateUnlock = async (password: ?string, email: ?string, unlockKey: ?string): Promise<void> => {
    const msg = await createUnlockKeyMessage({
      trustchainId: utils.toBase64(this._sessionData.trustchainId),
      deviceId: utils.toBase64(this._sessionData.deviceId),
      password,
      email,
      unlockKey,
      userSecret: this._sessionData.userSecret,
      privateSigKey: this._keyStore.privateSignatureKey
    });
    await this._client.updateUnlockKey(msg);
    this._updateUnlockMethods(password, email);
  }

  async setupUnlock(password: ?string, email: ?string): Promise<void> {
    const { block, unlockKey } = this._generateUnlockKey();
    const msg = await createUnlockKeyMessage({
      trustchainId: utils.toBase64(this._sessionData.trustchainId),
      deviceId: utils.toBase64(this._sessionData.deviceId),
      email,
      password,
      unlockKey,
      userSecret: this._sessionData.userSecret,
      privateSigKey: this._keyStore.privateSignatureKey
    });
    await this._client.sendBlock(block);
    await this._client.createUnlockKey(msg);
    this._updateUnlockMethods(password, email);
  }

  _updateUnlockMethods(password: ?string, email: ?string): void {
    if (password && !this._sessionData.unlockMethods.some((m) => m.type === 'password')) {
      this._sessionData.unlockMethods.push({ type: 'password' });
    }
    if (email && !this._sessionData.unlockMethods.some((m) => m.type === 'email')) {
      this._sessionData.unlockMethods.push({ type: 'email' });
    }
  }

  async registerUnlock(password: ?string, email: ?string): Promise<void> {
    if (this._sessionData.unlockMethods.length === 0) {
      return this.setupUnlock(password, email);
    } else
      return this.updateUnlock(password, email);
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
