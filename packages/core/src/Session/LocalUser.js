// @flow

import { tcrypto, utils, type Key, type b64string } from '@tanker/crypto';
import { type UnlockMethods } from '../Network/Client';
import { type DeviceType } from '../Unlock/unlock';
import KeyStore from './Keystore';
import BlockGenerator from '../Blocks/BlockGenerator';
import { type UserData } from '../Tokens/UserData';

export type DeviceKeys = {|
  deviceId: ?b64string,
  signaturePair: tcrypto.SodiumKeyPair,
  encryptionPair: tcrypto.SodiumKeyPair,
|}

export default class LocalUser {
  _userData: UserData;
  _deviceId: Uint8Array;
  _unlockMethods: UnlockMethods;
  _blockGenerator: BlockGenerator

  _deviceSignatureKeyPair: tcrypto.SodiumKeyPair;
  _deviceEncryptionKeyPair: tcrypto.SodiumKeyPair;
  _userKeys: { [string]: tcrypto.SodiumKeyPair };
  _currentUserKey: tcrypto.SodiumKeyPair;

  constructor(userData: UserData, unlockMethods: UnlockMethods, keyStore: KeyStore) {
    this._userData = userData;
    this._unlockMethods = unlockMethods;

    this._deviceSignatureKeyPair = keyStore.signatureKeyPair;
    this._deviceEncryptionKeyPair = keyStore.encryptionKeyPair;
    this._userKeys = {};
    this.setUserKeys(keyStore);

    if (!keyStore.deviceId)
      throw new Error('No device id for this user');
    this._deviceId = keyStore.deviceId;

    this._blockGenerator = new BlockGenerator(
      this.trustchainId,
      this.privateSignatureKey,
      this.deviceId,
    );
  }

  setUserKeys = (keyStore: KeyStore) => {
    const userKeys = keyStore.userKeys;
    for (const userKey of userKeys) {
      this._userKeys[utils.toBase64(userKey.publicKey)] = userKey;
      this._currentUserKey = userKey;
    }
  }

  get blockGenerator(): BlockGenerator {
    return this._blockGenerator;
  }

  get publicSignatureKey(): Key {
    return this._deviceSignatureKeyPair.publicKey;
  }
  get privateSignatureKey(): Key {
    return this._deviceSignatureKeyPair.privateKey;
  }
  get publicEncryptionKey(): Key {
    return this._deviceEncryptionKeyPair.publicKey;
  }
  get privateEncryptionKey(): Key {
    return this._deviceEncryptionKeyPair.privateKey;
  }
  get currentUserKey(): tcrypto.SodiumKeyPair {
    return this._currentUserKey;
  }
  get deviceId(): Uint8Array {
    return this._deviceId;
  }
  get userId(): Uint8Array {
    return this._userData.userId;
  }
  get trustchainId(): Uint8Array {
    return this._userData.trustchainId;
  }
  get deviceType(): DeviceType {
    return this._userData.deviceType;
  }
  get userSecret(): Uint8Array {
    return this._userData.userSecret;
  }
  get clearUserId(): string {
    return this._userData.clearUserId;
  }
  get unlockMethods(): UnlockMethods {
    return this._unlockMethods;
  }

  findUserKey(userPublicKey: Uint8Array): ?tcrypto.SodiumKeyPair {
    return this._userKeys[utils.toBase64(userPublicKey)];
  }
  deviceKeys = (): DeviceKeys => ({
    signaturePair: this._deviceSignatureKeyPair,
    encryptionPair: this._deviceEncryptionKeyPair,
    deviceId: utils.toBase64(this._deviceId)
  });
}
