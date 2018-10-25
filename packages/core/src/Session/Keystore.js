// @flow

import EventEmitter from 'events';

import { tcrypto, utils, type Key } from '@tanker/crypto';
import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';

import { InvalidUserToken } from '../errors';
import KeySafe, { type DeviceKeys } from './KeySafe';
import { type UserKeys, type UserKeyPair } from '../Blocks/payloads';
import { findIndex } from '../utils';

const TABLE = 'device';

export default class Keystore extends EventEmitter {
  _ds: DataStore<*>;
  _safe: KeySafe;
  _userKeys: { [string]: tcrypto.SodiumKeyPair };
  _wasRevoked: bool;

  static schemas = [
    { version: 1, tables: [{ name: TABLE, persistent: true }] },
    { version: 2, tables: [{ name: TABLE, persistent: true }] },
    { version: 3, tables: [{ name: TABLE, persistent: true }] },
    { version: 4, tables: [{ name: TABLE, persistent: true }] },
    // {
    //   version: 5,
    //   tables: [{
    //     name: TABLE,
    //     persistent: true,
    //     indexes: [['new_index'], ...]
    //   }]
    // }
  ];

  constructor(ds: DataStore<*>) {
    super();

    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
    this._wasRevoked = false;
  }

  getIdentity(): Object {
    const keyS = utils.toBase64(this._safe.signaturePair.publicKey);
    const keyC = utils.toBase64(this._safe.encryptionPair.publicKey);
    return { keyS, keyC };
  }

  get deviceKeys(): DeviceKeys {
    return this._safe.deviceKeys();
  }

  get publicSignatureKey(): Key {
    return this._safe.signaturePair.publicKey;
  }

  get privateSignatureKey(): Key {
    return this._safe.signaturePair.privateKey;
  }

  get publicEncryptionKey(): Key {
    return this._safe.encryptionPair.publicKey;
  }

  get privateEncryptionKey(): Key {
    return this._safe.encryptionPair.privateKey;
  }

  get encryptionKeyPair(): tcrypto.SodiumKeyPair {
    return this._safe.encryptionPair;
  }

  get signatureKeyPair(): tcrypto.SodiumKeyPair {
    return this._safe.signaturePair;
  }

  get userKeys(): Array<tcrypto.SodiumKeyPair> {
    return this._safe.userKeys;
  }

  get currentUserKey(): tcrypto.SodiumKeyPair {
    if (this.userKeys.length < 1)
      throw new Error('No user key for this user');
    return this.userKeys.slice(-1)[0];
  }

  get deviceId(): ?Uint8Array {
    if (!this._safe.deviceId)
      return;
    return utils.fromBase64(this._safe.deviceId);
  }

  get wasRevoked(): bool {
    return this._wasRevoked;
  }

  // remove everything except private device keys.
  async clearCache() {
    delete this._safe.deviceId;
    this._safe.userKeys = [];
    this._safe.encryptedUserKeys = [];
    this._userKeys = {};
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  findUserKey(userPublicKey: Uint8Array): ?tcrypto.SodiumKeyPair {
    return this._userKeys[utils.toBase64(userPublicKey)];
  }

  async close(): Promise<void> {
    // Erase traces of critical data first
    utils.memzero(this._safe.userSecret);
    utils.memzero(this._safe.encryptionPair.privateKey);
    utils.memzero(this._safe.signaturePair.privateKey);
    utils.memzero(this._safe.encryptionPair.publicKey);
    utils.memzero(this._safe.signaturePair.publicKey);
    this._safe.deviceId = '';

    // $FlowIKnow
    this._ds = null;
  }

  static async open(ds: DataStore<*>, userSecret: Uint8Array): Promise<Keystore> {
    const keystore = new Keystore(ds);
    await keystore.initData(userSecret);
    return keystore;
  }

  async initData(userSecret: Uint8Array) {
    let safe: ?KeySafe;

    // Try to get safe from the storage, create a new one if not exists.
    try {
      const record = await this._ds.get(TABLE, 'keySafe');
      safe = await KeySafe.open(userSecret, record.encryptedSafe);
    } catch (e) {
      if (e instanceof dbErrors.RecordNotFound) {
        safe = KeySafe.create(userSecret);
        const record = { _id: 'keySafe', encryptedSafe: await safe.serialize() };
        await this._ds.put(TABLE, record);
      } else {
        throw new InvalidUserToken(e);
      }
    }

    if (!safe.signaturePair)
      throw new Error(`Invalid sign key: ${safe.signaturePair}`);
    if (!safe.encryptionPair)
      throw new Error(`Invalid crypt key: ${safe.encryptionPair}`);
    if (!safe.userSecret)
      throw new Error('Invalid user secret');
    // This allows migration from SDK < 1.7.0 (userKeys did not exist before DC3):
    if (!safe.userKeys)
      safe.userKeys = [];

    const userKeys = {};
    for (const userKey of safe.userKeys) {
      userKeys[utils.toBase64(userKey.publicKey)] = userKey;
    }

    // Read-only (non writable, non enumerable, non reconfigurable)
    Object.defineProperty(this, '_safe', {
      value: safe,
    });
    this._userKeys = userKeys;
  }

  async processDeviceCreationUserKeyPair(deviceId: Uint8Array, devicePublicKey: Uint8Array, userKeyPair: ?UserKeyPair): Promise<void> {
    if (!utils.equalArray(this.publicEncryptionKey, devicePublicKey)) {
      return;
    }
    await this._setDeviceId(deviceId);

    // Possible for deviceCreation 1
    if (!userKeyPair)
      return;

    const encryptedPrivKey = userKeyPair.encrypted_private_encryption_key;
    const privateKey = tcrypto.sealDecrypt(encryptedPrivKey, this.encryptionKeyPair);
    await this._addUserKey({
      privateKey,
      publicKey: userKeyPair.public_encryption_key,
    });

    await this._recoverUserKeys();
  }

  async processDeviceRevocationUserKeys(revokedDeviceId: Uint8Array, userKeys: ?UserKeys): Promise<void> {
    if (this._wasRevoked)
      return;

    if (this.deviceId && utils.equalArray(revokedDeviceId, this.deviceId)) {
      this._wasRevoked = true;
      this.emit('device_revoked');
      return;
    }

    // Possible for deviceRevocation V1
    if (!userKeys) {
      return;
    }

    // The block passed verif, if we don't have our deviceId yet, then it simply predates our device
    if (!this.deviceId) {
      await this._addEncryptedUserKey(userKeys);
      return;
    }

    // $FlowIKnow that deviceId is not null
    const privKeyIndex = findIndex(userKeys.private_keys, k => utils.equalArray(k.recipient, this.deviceId));
    if (privKeyIndex === -1)
      throw new Error('Assertion error: Couldn\'t decrypt revocation keys, even tho we know our device ID!');

    const encryptedPrivKey = userKeys.private_keys[privKeyIndex].key;
    const privateKey = tcrypto.sealDecrypt(encryptedPrivKey, this.encryptionKeyPair);
    await this._addUserKey({
      privateKey,
      publicKey: userKeys.public_encryption_key,
    });
  }

  async _setDeviceId(hash: Uint8Array) {
    this._safe.deviceId = utils.toBase64(hash);
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  async _addUserKey(keyPair: tcrypto.SodiumKeyPair) {
    this._safe.userKeys.push(keyPair);
    this._userKeys[utils.toBase64(keyPair.publicKey)] = keyPair;
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  async _addEncryptedUserKey(keys: UserKeys) {
    this._safe.encryptedUserKeys.unshift(keys);
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  async _takeEncryptedUserKeys(): Promise<Array<UserKeys>> {
    const keys = this._safe.encryptedUserKeys;
    this._safe.encryptedUserKeys = [];
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    await this._ds.put(TABLE, record);
    return keys;
  }

  async _prependUserKey(keyPair: tcrypto.SodiumKeyPair) {
    this._safe.userKeys.unshift(keyPair);
    this._userKeys[utils.toBase64(keyPair.publicKey)] = keyPair;
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  async _recoverUserKeys() {
    const revocationKeys = await this._takeEncryptedUserKeys();
    for (const revUserKeys of revocationKeys) {
      // Upgrade from userV1 to userV3
      if (utils.equalArray(new Uint8Array(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE), revUserKeys.previous_public_encryption_key))
        continue; // eslint-disable-line no-continue

      const keyPair = this.findUserKey(revUserKeys.public_encryption_key);
      if (!keyPair) {
        throw new Error('Assertion error: missing key to decrypt previous user key');
      }
      const privateKey = tcrypto.sealDecrypt(revUserKeys.encrypted_previous_encryption_key, keyPair);
      await this._prependUserKey({
        publicKey: revUserKeys.previous_public_encryption_key,
        privateKey,
      });
    }
  }
}
