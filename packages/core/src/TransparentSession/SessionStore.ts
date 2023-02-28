import type { Key } from '@tanker/crypto';
import { utils, EncryptionV1 } from '@tanker/crypto';
import type { DataStore } from '@tanker/datastore-base';
import { errors as dbErrors } from '@tanker/datastore-base';
import { InternalError } from '@tanker/errors';

const TABLE = 'session_keys';

export type SessionResult = {
  id: Uint8Array;
  key: Key;
};

export const sessionTTL = 12 * 3600;

export class TransparentSessionStore {
  declare _ds: DataStore;
  declare _userSecret: Uint8Array;

  static schemas = [
    // this store didn't exist before schema version 14
    { version: 1, tables: [] },
    { version: 2, tables: [] },
    { version: 3, tables: [] },
    { version: 4, tables: [] },
    { version: 5, tables: [] },
    { version: 6, tables: [] },
    { version: 7, tables: [] },
    { version: 8, tables: [] },
    { version: 9, tables: [] },
    { version: 10, tables: [] },
    { version: 11, tables: [] },
    { version: 12, tables: [] },
    { version: 13, tables: [] },
    { version: 14, tables: [{ name: TABLE }] },
    { version: 15, tables: [{ name: TABLE }] },
  ];

  constructor(ds: DataStore, userSecret: Uint8Array) {
    if (!userSecret)
      throw new InternalError('Invalid user secret');

    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
    Object.defineProperty(this, '_userSecret', { value: userSecret }); // + not writable
  }

  now(): number {
    return Date.now() / 1000;
  }

  async saveSessionKey(recipientsHash: Uint8Array, sessionId: Uint8Array, key: Key): Promise<void> {
    // prevent db corruption by using the recipientsHash, sessionId and createdAt as additional data
    const createdAt = this.now();
    const associatedData = utils.concatArrays(recipientsHash, sessionId, utils.fromString(createdAt.toString()));
    const encryptedKey = EncryptionV1.serialize(EncryptionV1.encrypt(this._userSecret, key, associatedData));
    const b64RecipientsHash = utils.toBase64(recipientsHash);

    await this._ds.put(TABLE, { _id: b64RecipientsHash, b64sessionId: utils.toBase64(sessionId), b64EncryptedKey: utils.toBase64(encryptedKey), createdAt });
  }

  async findSessionKey(recipientsHash: Uint8Array): Promise<SessionResult | null> {
    try {
      const b64RecipientsHash = utils.toBase64(recipientsHash);
      const result = await this._ds.get(TABLE, b64RecipientsHash);
      const createdAt = result['createdAt'];
      const currentTime = this.now();
      if (currentTime < createdAt || currentTime > createdAt + sessionTTL) {
        return null;
      }

      const id = utils.fromBase64(result['b64sessionId']);
      const associatedData = utils.concatArrays(recipientsHash, id, utils.fromString(createdAt.toString()));
      const encryptedKey = utils.fromBase64(result['b64EncryptedKey']!);
      return {
        id,
        key: await EncryptionV1.decrypt(() => this._userSecret, EncryptionV1.unserialize(encryptedKey), associatedData),
      };
    } catch (e) {
      if (e instanceof dbErrors.RecordNotFound) {
        return null;
      }
      throw e;
    }
  }

  async close(): Promise<void> {
    // Erase traces of critical data first
    utils.memzero(this._userSecret);

    // @ts-expect-error
    this._ds = null;
  }

  static async open(ds: DataStore, userSecret: Uint8Array): Promise<TransparentSessionStore> {
    return new TransparentSessionStore(ds, userSecret);
  }
}
