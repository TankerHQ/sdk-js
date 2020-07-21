// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';

import { deserializeKeySafe, generateKeySafe, serializeKeySafe } from './KeySafe';
import type { KeySafe, IndexedProvisionalUserKeyPairs } from './KeySafe';
import { type Device } from '../Users/types';

const TABLE = 'device';

export type LocalData = {|
  deviceSignatureKeyPair: tcrypto.SodiumKeyPair;
  deviceEncryptionKeyPair: tcrypto.SodiumKeyPair;
  userKeys: { [string]: tcrypto.SodiumKeyPair };
  currentUserKey: ?tcrypto.SodiumKeyPair;
  deviceId: ?Uint8Array,
  deviceInitialized: bool,
  trustchainPublicKey: ?Uint8Array,
  devices: Array<Device>,
|};

export default class KeyStore {
  /*:: _ds: DataStore<*>; */
  /*:: _safe: KeySafe; */

  static schemas = [
    { version: 1, tables: [{ name: TABLE, persistent: true }] },
    { version: 2, tables: [{ name: TABLE, persistent: true }] },
    { version: 3, tables: [{ name: TABLE, persistent: true }] },
    { version: 4, tables: [{ name: TABLE, persistent: true }] },
    { version: 5, tables: [{ name: TABLE, persistent: true }] },
    { version: 6, tables: [{ name: TABLE, persistent: true }] },
    { version: 7, tables: [{ name: TABLE, persistent: true }] },
    { version: 8, tables: [{ name: TABLE, persistent: true }] },
    { version: 9, tables: [{ name: TABLE, persistent: true }] },
    { version: 10, tables: [{ name: TABLE, persistent: true }] },
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

  get localData(): LocalData {
    const { signaturePair, encryptionPair, localUserKeys, deviceId, deviceInitialized, trustchainPublicKey, devices } = this._safe;
    return {
      deviceSignatureKeyPair: signaturePair,
      deviceEncryptionKeyPair: encryptionPair,
      userKeys: localUserKeys ? localUserKeys.userKeys : {},
      currentUserKey: localUserKeys ? localUserKeys.currentUserKey : null,
      deviceId: deviceId ? utils.fromBase64(deviceId) : null,
      deviceInitialized,
      trustchainPublicKey: trustchainPublicKey ? utils.fromBase64(trustchainPublicKey) : null,
      devices,
    };
  }

  async save(localData: LocalData, userSecret: Uint8Array) {
    if (localData.currentUserKey)
      this._safe.localUserKeys = { userKeys: localData.userKeys, currentUserKey: localData.currentUserKey };
    this._safe.deviceId = localData.deviceId ? utils.toBase64(localData.deviceId) : null;
    this._safe.deviceInitialized = localData.deviceInitialized;
    this._safe.devices = localData.devices;
    this._safe.trustchainPublicKey = localData.trustchainPublicKey ? utils.toBase64(localData.trustchainPublicKey) : null;
    return this._saveSafe(userSecret);
  }

  get provisionalUserKeys(): IndexedProvisionalUserKeyPairs {
    return this._safe.provisionalUserKeys;
  }

  async saveProvisionalUserKeys(provisionalUserKeys: IndexedProvisionalUserKeyPairs, userSecret: Uint8Array): Promise<void> {
    this._safe.provisionalUserKeys = provisionalUserKeys;
    return this._saveSafe(userSecret);
  }

  async _saveSafe(userSecret: Uint8Array): Promise<void> {
    const encryptedSafe = await serializeKeySafe(this._safe, userSecret);
    const record = { _id: 'keySafe', encryptedSafe };
    return this._ds.put(TABLE, record);
  }

  // remove everything except private device keys.
  clearCache(userSecret: Uint8Array): Promise<void> {
    delete this._safe.deviceId;
    delete this._safe.trustchainPublicKey;
    this._safe.deviceInitialized = false;
    this._safe.provisionalUserKeys = {};
    return this._saveSafe(userSecret);
  }

  async close(): Promise<void> {
    // First erase traces of critical data in memory
    utils.memzero(this._safe.encryptionPair.privateKey);
    utils.memzero(this._safe.signaturePair.privateKey);
    utils.memzero(this._safe.encryptionPair.publicKey);
    utils.memzero(this._safe.signaturePair.publicKey);
    delete this._safe.deviceId;
    delete this._safe.trustchainPublicKey;

    // Then let GC do its job
    // $FlowIgnore
    this._ds = null;
  }

  static async open(ds: DataStore<*>, userSecret: Uint8Array): Promise<KeyStore> {
    const keystore = new KeyStore(ds);
    await keystore.initData(userSecret);
    return keystore;
  }

  async initData(userSecret: Uint8Array): Promise<void> {
    let record: Object;
    let safe: ?KeySafe;
    let upgraded: bool = false;

    // Try to get safe from the storage, might not exist yet
    try {
      record = await this._ds.get(TABLE, 'keySafe');
    } catch (e) {
      // Stop if any real db error
      if (!(e instanceof dbErrors.RecordNotFound)) {
        console.error('Could not read keysafe from keystore');
        throw e;
      }
    }

    // Try to deserialize the safe
    try {
      if (record) {
        ({ safe, upgraded } = await deserializeKeySafe(record.encryptedSafe, userSecret));
      }
    } catch (e) {
      // Log unexpected error. That said, there's not much that can be done...
      // Just override with a new key safe not to lock the user out.
      // They'll need to verify identity to create a new device.
      console.error('Could not deserialize an existing keysafe');
      console.error(e);
    }

    // New device or broken device: create a new safe
    if (!safe) {
      safe = generateKeySafe();
      record = { _id: 'keySafe', encryptedSafe: await serializeKeySafe(safe, userSecret) };
      await this._ds.put(TABLE, record);
    }

    // Read-only (non writable, non enumerable, non reconfigurable)
    Object.defineProperty(this, '_safe', { value: safe });

    // If the format of the safe has changed, save the upgraded version
    if (upgraded) {
      await this._saveSafe(userSecret);
    }
  }
}
