import type { Key } from '@tanker/crypto';
import { utils, encryptionV1 } from '@tanker/crypto';
import type { DataStore } from '@tanker/datastore-base';
import { errors as dbErrors } from '@tanker/datastore-base';
import { InternalError } from '@tanker/errors';

const TABLE = 'resource_keys';

export default class ResourceStore {
  declare _ds: DataStore<any>;
  declare _userSecret: Uint8Array;

  static schemas = [
    { version: 1, tables: [{ name: TABLE }] },
    { version: 2, tables: [{ name: TABLE }] },
    { version: 3, tables: [{ name: TABLE }] },
    { version: 4, tables: [{ name: TABLE }] },
    { version: 5, tables: [{ name: TABLE }] },
    { version: 6, tables: [{ name: TABLE }] },
    { version: 7, tables: [{ name: TABLE }] },
    { version: 8, tables: [{ name: TABLE }] },
    { version: 9, tables: [{ name: TABLE }] },
    { version: 10, tables: [{ name: TABLE }] },
    { version: 11, tables: [{ name: TABLE }] },
    { version: 12, tables: [{ name: TABLE }] },
    { version: 13, tables: [{ name: TABLE }] },
    // {
    //   version: 8,
    //   tables: [{
    //     name: TABLE,
    //     indexes: [['new_index'], ...]
    //   }]
    // }
  ];

  constructor(ds: DataStore<any>, userSecret: Uint8Array) {
    if (!userSecret)
      throw new InternalError('Invalid user secret');

    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
    Object.defineProperty(this, '_userSecret', { value: userSecret }); // + not writable
  }

  async saveResourceKey(resourceId: Uint8Array, key: Key): Promise<void> {
    // prevent db corruption by using the resourceId as additional data
    const encryptedKey = encryptionV1.serialize(encryptionV1.encrypt(this._userSecret, key, resourceId));
    const b64ResourceId = utils.toBase64(resourceId);
    // We never want to overwrite a key for a given resourceId
    try {
      await this._ds.get(TABLE, b64ResourceId);
      // if the key is already there, just ignore the new one
      return;
    } catch (e) {
      if (!(e instanceof dbErrors.RecordNotFound)) {
        throw e;
      }
    }

    await this._ds.put(TABLE, { _id: b64ResourceId, b64EncryptedKey: utils.toBase64(encryptedKey) });
  }

  async findResourceKey(resourceId: Uint8Array): Promise<Key | typeof undefined> {
    try {
      const b64ResourceId = utils.toBase64(resourceId);
      const result = await this._ds.get(TABLE, b64ResourceId);
      const encryptedKey = utils.fromBase64(result.b64EncryptedKey);

      return encryptionV1.compatDecrypt(this._userSecret, encryptedKey, resourceId);
    } catch (e) {
      if (e instanceof dbErrors.RecordNotFound) {
        return;
      }
      throw e;
    }
  }

  async close(): Promise<void> {
    // Erase traces of critical data first
    utils.memzero(this._userSecret);

    // $FlowIgnore
    this._ds = null;
  }

  static async open(ds: DataStore<any>, userSecret: Uint8Array): Promise<any> {
    return new ResourceStore(ds, userSecret);
  }
}
