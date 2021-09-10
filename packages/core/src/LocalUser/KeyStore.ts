import { tcrypto, utils } from '@tanker/crypto';
import type { DataStore } from '@tanker/datastore-base';
import { errors as dbErrors } from '@tanker/datastore-base';

import { deserializeKeySafe, generateKeySafe, serializeKeySafe } from './KeySafe';
import type { KeySafe, IndexedProvisionalUserKeyPairs } from './KeySafe';
import type { Device } from '../Users/types';

const TABLE = 'device';

export type LocalData = {
  currentUserKey: ?tcrypto.SodiumKeyPair;
  deviceId: ?Uint8Array;
  deviceEncryptionKeyPair: ?tcrypto.SodiumKeyPair;
  deviceSignatureKeyPair: ?tcrypto.SodiumKeyPair;
  devices: Array<Device>;
  trustchainPublicKey: ?Uint8Array;
  userKeys: Record<string, tcrypto.SodiumKeyPair>;
};

export default class KeyStore {
  declare _ds: DataStore<any>;
  declare _safe: KeySafe;

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
    { version: 11, tables: [{ name: TABLE, persistent: true }] },
    { version: 12, tables: [{ name: TABLE, persistent: true }] },
    { version: 13, tables: [{ name: TABLE, persistent: true }] },
    // {
    //   version: 8,
    //   tables: [{
    //     name: TABLE,
    //     persistent: true,
    //     indexes: [['new_index'], ...]
    //   }]
    // }
  ];

  constructor(ds: DataStore<any>) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
  }

  get localData(): LocalData {
    const { signaturePair, encryptionPair, localUserKeys, deviceId, trustchainPublicKey, devices } = this._safe;
    return {
      deviceSignatureKeyPair: signaturePair,
      deviceEncryptionKeyPair: encryptionPair,
      userKeys: localUserKeys ? localUserKeys.userKeys : {},
      currentUserKey: localUserKeys ? localUserKeys.currentUserKey : null,
      deviceId: deviceId ? utils.fromBase64(deviceId) : null,
      trustchainPublicKey: trustchainPublicKey ? utils.fromBase64(trustchainPublicKey) : null,
      devices,
    };
  }

  async save(localData: LocalData, userSecret: Uint8Array) {
    if (localData.currentUserKey)
      this._safe.localUserKeys = { userKeys: localData.userKeys, currentUserKey: localData.currentUserKey };
    if (localData.deviceSignatureKeyPair)
      this._safe.signaturePair = localData.deviceSignatureKeyPair;
    if (localData.deviceEncryptionKeyPair)
      this._safe.encryptionPair = localData.deviceEncryptionKeyPair;
    if (localData.deviceId)
      this._safe.deviceId = utils.toBase64(localData.deviceId);
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
    delete this._safe.trustchainPublicKey;
    this._safe.provisionalUserKeys = {};
    this._safe.localUserKeys = null;
    return this._saveSafe(userSecret);
  }

  async close(): Promise<void> {
    // First erase traces of critical data in memory
    [this._safe.encryptionPair, this._safe.signaturePair].forEach(keyPair => {
      if (keyPair) {
        utils.memzero(keyPair.privateKey);
        utils.memzero(keyPair.publicKey);
      }
    });
    delete this._safe.deviceId;
    delete this._safe.trustchainPublicKey;

    // Then let GC do its job
    // $FlowIgnore
    this._ds = null;
  }

  static async open(ds: DataStore<any>, userSecret: Uint8Array): Promise<KeyStore> {
    const keystore = new KeyStore(ds);
    await keystore.initData(userSecret);
    return keystore;
  }

  async initData(userSecret: Uint8Array): Promise<void> {
    let record: Record<string, any>;
    let safe: ?KeySafe = null;

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
        safe = await deserializeKeySafe(record.encryptedSafe, userSecret);
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
  }
}
