// @flow

import { tcrypto, utils, type Key } from '@tanker/crypto';
import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';

import KeySafe, { type IndexedProvisionalUserKeyPairs, type ProvisionalUserKeyPairs } from './KeySafe';
import { type UserKeys } from '../Blocks/payloads';

const TABLE = 'device';

export default class Keystore {
  _ds: DataStore<*>;
  _safe: KeySafe;
  _userKeys: { [string]: tcrypto.SodiumKeyPair };

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
    const index = this.userKeys.length - 1;
    if (index < 0)
      throw new Error('No user key for this user');
    return this.userKeys[index];
  }

  get deviceId(): ?Uint8Array {
    if (!this._safe.deviceId)
      return;
    return utils.fromBase64(this._safe.deviceId);
  }

  get provisionalUserKeys(): IndexedProvisionalUserKeyPairs {
    return this._safe.provisionalUserKeys;
  }

  findUserKey(userPublicKey: Uint8Array): ?tcrypto.SodiumKeyPair {
    return this._userKeys[utils.toBase64(userPublicKey)];
  }

  findProvisionalKey(id: string): ProvisionalUserKeyPairs {
    return this._safe.provisionalUserKeys[id];
  }

  async saveSafe(): Promise<void> {
    const encryptedSafe = await this._safe.serialize();
    const record = { _id: 'keySafe', encryptedSafe };
    return this._ds.put(TABLE, record);
  }

  // remove everything except private device keys.
  clearCache(): Promise<void> {
    delete this._safe.deviceId;
    this._safe.userKeys = [];
    this._safe.encryptedUserKeys = [];
    this._safe.provisionalUserKeys = {};
    this._userKeys = {};
    return this.saveSafe();
  }

  async close(): Promise<void> {
    // First erase traces of critical data in memory
    utils.memzero(this._safe.userSecret);
    utils.memzero(this._safe.encryptionPair.privateKey);
    utils.memzero(this._safe.signaturePair.privateKey);
    utils.memzero(this._safe.encryptionPair.publicKey);
    utils.memzero(this._safe.signaturePair.publicKey);
    this._safe.deviceId = '';

    // Then let GC do its job
    delete this._ds;
  }

  static async open(ds: DataStore<*>, userSecret: Uint8Array): Promise<Keystore> {
    const keystore = new Keystore(ds);
    await keystore.initData(userSecret);
    return keystore;
  }

  async initData(userSecret: Uint8Array) {
    let safe: ?KeySafe;

    // Try to get safe from the storage, create a new one if it does not exist
    try {
      const record = await this._ds.get(TABLE, 'keySafe');
      safe = await KeySafe.open(userSecret, record.encryptedSafe);
    } catch (e) {
      if (e instanceof dbErrors.RecordNotFound) {
        safe = KeySafe.create(userSecret);
        const record = { _id: 'keySafe', encryptedSafe: await safe.serialize() };
        await this._ds.put(TABLE, record);
      } else {
        throw e;
      }
    }

    // Read-only (non writable, non enumerable, non reconfigurable)
    Object.defineProperty(this, '_safe', { value: safe });

    const userKeys = {};
    for (const userKey of safe.userKeys) {
      userKeys[utils.toBase64(userKey.publicKey)] = userKey;
    }
    this._userKeys = userKeys;
  }

  setDeviceId(hash: Uint8Array): Promise<void> {
    this._safe.deviceId = utils.toBase64(hash);
    return this.saveSafe();
  }

  addProvisionalUserKeys(id: string, appEncryptionKeyPair: tcrypto.SodiumKeyPair, tankerEncryptionKeyPair: tcrypto.SodiumKeyPair): Promise<void> {
    this._safe.provisionalUserKeys[id] = { id, appEncryptionKeyPair, tankerEncryptionKeyPair };
    return this.saveSafe();
  }

  addUserKey(keyPair: tcrypto.SodiumKeyPair): Promise<void> {
    this._safe.userKeys.push(keyPair);
    this._userKeys[utils.toBase64(keyPair.publicKey)] = keyPair;
    return this.saveSafe();
  }

  prependUserKey(keyPair: tcrypto.SodiumKeyPair): Promise<void> {
    this._safe.userKeys.unshift(keyPair);
    this._userKeys[utils.toBase64(keyPair.publicKey)] = keyPair;
    return this.saveSafe();
  }

  prependEncryptedUserKey(keys: UserKeys): Promise<void> {
    this._safe.encryptedUserKeys.unshift(keys);
    return this.saveSafe();
  }

  async takeEncryptedUserKeys(): Promise<Array<UserKeys>> {
    const keys = this._safe.encryptedUserKeys;
    this._safe.encryptedUserKeys = [];
    await this.saveSafe();
    return keys;
  }
}
