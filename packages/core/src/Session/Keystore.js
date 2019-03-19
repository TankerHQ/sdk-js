// @flow

import { tcrypto, utils, type Key } from '@tanker/crypto';
import { InvalidIdentity } from '@tanker/identity';
import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';

import KeySafe, { type ProvisionalIdentityKeyPairs } from './KeySafe';
import { type UserKeys } from '../Blocks/payloads';

const TABLE = 'device';

export default class Keystore {
  _ds: DataStore<*>;
  _safe: KeySafe;
  _userKeys: { [string]: tcrypto.SodiumKeyPair };
  _provisionalIdentityKeys: { [string]: ProvisionalIdentityKeyPairs };

  static schemas = [
    { version: 1, tables: [{ name: TABLE, persistent: true }] },
    { version: 2, tables: [{ name: TABLE, persistent: true }] },
    { version: 3, tables: [{ name: TABLE, persistent: true }] },
    { version: 4, tables: [{ name: TABLE, persistent: true }] },
    { version: 5, tables: [{ name: TABLE, persistent: true }] },
    { version: 6, tables: [{ name: TABLE, persistent: true }] },
    { version: 7, tables: [{ name: TABLE, persistent: true }] },
    // {
    //   version: 8,
    //   tables: [{
    //     name: TABLE,
    //     persistent: true,
    //     indexes: [['new_index'], ...]
    //   }]
    // }
  ];

  constructor(ds: DataStore<*>) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
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

  // remove everything except private device keys.
  async clearCache() {
    delete this._safe.deviceId;
    this._safe.userKeys = [];
    this._safe.encryptedUserKeys = [];
    this._safe.provisionalIdentityKeys = [];
    this._userKeys = {};
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  findUserKey(userPublicKey: Uint8Array): ?tcrypto.SodiumKeyPair {
    return this._userKeys[utils.toBase64(userPublicKey)];
  }

  findProvisionalKey(id: string): ProvisionalIdentityKeyPairs {
    return this._provisionalIdentityKeys[id];
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
        throw new InvalidIdentity(e.message());
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
    if (!safe.provisionalIdentityKeys)
      safe.provisionalIdentityKeys = [];

    const userKeys = {};
    for (const userKey of safe.userKeys) {
      userKeys[utils.toBase64(userKey.publicKey)] = userKey;
    }
    const provisionalIdentityKeys = {};
    for (const ident of safe.provisionalIdentityKeys) {
      provisionalIdentityKeys[ident.id] = ident;
    }

    // Read-only (non writable, non enumerable, non reconfigurable)
    Object.defineProperty(this, '_safe', {
      value: safe,
    });
    this._userKeys = userKeys;
    this._provisionalIdentityKeys = provisionalIdentityKeys;
  }

  async setDeviceId(hash: Uint8Array) {
    this._safe.deviceId = utils.toBase64(hash);
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  async addUserKey(keyPair: tcrypto.SodiumKeyPair) {
    this._safe.userKeys.push(keyPair);
    this._userKeys[utils.toBase64(keyPair.publicKey)] = keyPair;
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  async addEncryptedUserKey(keys: UserKeys) {
    this._safe.encryptedUserKeys.unshift(keys);
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  async takeEncryptedUserKeys(): Promise<Array<UserKeys>> {
    const keys = this._safe.encryptedUserKeys;
    this._safe.encryptedUserKeys = [];
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    await this._ds.put(TABLE, record);
    return keys;
  }

  async prependUserKey(keyPair: tcrypto.SodiumKeyPair) {
    this._safe.userKeys.unshift(keyPair);
    this._userKeys[utils.toBase64(keyPair.publicKey)] = keyPair;
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }

  async addProvisionalIdentityKeys(id: string, appEncryptionKeyPair: tcrypto.SodiumKeyPair, tankerEncryptionKeyPair: tcrypto.SodiumKeyPair) {
    const keys = { appEncryptionKeyPair, tankerEncryptionKeyPair };
    this._safe.provisionalIdentityKeys.push({ id, ...keys });
    this._provisionalIdentityKeys[id] = keys;
    const record = await this._ds.get(TABLE, 'keySafe');
    record.encryptedSafe = await this._safe.serialize();
    return this._ds.put(TABLE, record);
  }
}
