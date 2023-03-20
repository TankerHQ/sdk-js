import type { Key, b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';
import type { DataStore } from '@tanker/datastore-base';
import { errors as dbErrors } from '@tanker/datastore-base';
import { InternalError } from '@tanker/errors';

export const TABLE = 'oidc_nonces';
const EXPIRATION = 60 * 60 * 1000; // 1h in milliseconds

// nonce is in raw url base64 encode and start with a lead `_`
// pouchdb rejects entry with an leading `_`
export const idFromNonce = (nonce: string) => `id:${nonce}`;

export class OidcStore {
  declare _ds: DataStore;

  static schemas = [
    { version: 1, tables: [{ name: TABLE }] },
    // {
    //   version: 8,
    //   tables: [{
    //     name: TABLE,
    //     indexes: [['new_index'], ...]
    //   }]
    // }
  ];

  constructor(ds: DataStore) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
  }

  async saveOidcNonce(nonce: Key, privateNonceKey: Key): Promise<void> {
    const b64OidcNonce = utils.toRawUrlBase64(nonce);
    const id = idFromNonce(b64OidcNonce);
    // We never want to overwrite an existing nonce
    if (await this._ds.first(TABLE, { selector: { _id: id } }) !== undefined) {
      throw new InternalError('Nonce already used');
    }

    await this._ds.put(TABLE, { _id: id, b64PrivateNonceKey: privateNonceKey, createdAt: Date.now() });
  }

  async removeOidcNonce(nonce: b64string): Promise<void> {
    try {
      await this._ds.delete(TABLE, idFromNonce(nonce));
    } catch (e) {
      if (!(e instanceof dbErrors.RecordNotFound)) {
        throw e;
      }
    }
  }

  async findOidcNonce(nonce: b64string): Promise<Key | void> {
    try {
      const result = await this._ds.get(TABLE, idFromNonce(nonce));
      return result['b64PrivateNonceKey']!;
    } catch (e) {
      if (e instanceof dbErrors.RecordNotFound) {
        return;
      }
      throw e;
    }
  }

  async clean(): Promise<void> {
    const minCreationDate = Date.now() - EXPIRATION;

    const nonces = await this._ds.getAll(TABLE);
    const expiredNonce = nonces.filter((nonce) => {
      const createdAt = nonce['createdAt'];
      return !createdAt || typeof createdAt !== 'number' || createdAt < minCreationDate;
    });

    return this._ds.bulkDelete(TABLE, expiredNonce);
  }

  async close(): Promise<void> {
    await this.clean();
    // @ts-expect-error
    this._ds = null;
  }

  static async open(ds: DataStore): Promise<OidcStore> {
    return new OidcStore(ds);
  }
}
