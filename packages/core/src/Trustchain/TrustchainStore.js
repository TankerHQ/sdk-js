// @flow

import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';
import { type VerificationFields } from '../Blocks/entries';

export type UnverifiedTrustchainCreation = {
  ...VerificationFields,
  public_signature_key: Uint8Array,
}

export const TABLE_METADATA = 'trustchain_metadata';

const TABLE = 'trustchain';
const LAST_BLOCK_INDEX_KEY = 'lastBlockIndex';
const TRUSTCHAIN_PUBLIC_KEY = 'trustchainPublicKey';

// basic local trustchain storage
export default class TrustchainStore {
  _ds: DataStore<*>;
  _lastBlockIndex: number;
  _trustchainPublicKey: ?Uint8Array;

  static schemas = [
    {
      version: 1,
      tables: [{
        name: TABLE,
        indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac']]
      }]
    },
    {
      version: 2,
      tables: [{
        name: TABLE,
        indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac'], ['user_public_key'], ['group_public_encryption_key']]
      }]
    },
    {
      version: 3,
      tables: [
        {
          name: TABLE,
          indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac'], ['user_public_key'], ['group_public_encryption_key'], ['group_id']]
        },
        {
          name: TABLE_METADATA
        }
      ]
    },
    {
      version: 4,
      tables: [
        {
          name: TABLE,
          indexes: [['hash'], ['nature']]
        },
        {
          name: TABLE_METADATA
        }
      ]
    },
    {
      version: 5,
      tables: [
        {
          name: TABLE_METADATA
        }
      ]
    },
    {
      version: 6,
      tables: [
        {
          name: TABLE_METADATA
        }
      ]
    },
  ];

  constructor(ds: DataStore<*>) {
    // won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
    Object.defineProperty(this, '_lastBlockIndex', { value: 0, writable: true });
  }

  get lastBlockIndex(): number {
    return this._lastBlockIndex;
  }

  async updateLastBlockIndex(index: number): Promise<void> {
    if (index > this._lastBlockIndex) {
      const record = { _id: LAST_BLOCK_INDEX_KEY, index };
      await this._ds.put(TABLE_METADATA, record);
      this._lastBlockIndex = index;
    }
  }

  get trustchainPublicKey(): Uint8Array {
    if (!this._trustchainPublicKey) {
      throw new Error('Assertion error: Trustchain public key does not exist');
    }
    return this._trustchainPublicKey;
  }

  async setTrustchainPublicKey(trustchainPublicKey: Uint8Array): Promise<void> {
    if (this._trustchainPublicKey) {
      return;
    }
    const record = { _id: TRUSTCHAIN_PUBLIC_KEY, trustchainPublicKey };
    await this._ds.put(TABLE_METADATA, record);
    this._trustchainPublicKey = trustchainPublicKey;
  }

  static async open(ds: DataStore<*>): Promise<TrustchainStore> {
    const trustchain = new TrustchainStore(ds);
    await trustchain.initData();
    return trustchain;
  }

  async initData() {
    await this.initLastBlockIndex();
    await this.initTrustchainPublicKey();
  }

  async initLastBlockIndex(): Promise<void> {
    // Try to retrieve last block index from the storage
    try {
      const record = await this._ds.get(TABLE_METADATA, LAST_BLOCK_INDEX_KEY);
      this._lastBlockIndex = record.index;
    } catch (e) {
      // Create a new one if not exists
      if (e instanceof dbErrors.RecordNotFound) {
        const record = { _id: LAST_BLOCK_INDEX_KEY, index: 0 };
        this._lastBlockIndex = 0;
        await this._ds.put(TABLE_METADATA, record);
        return;
      }

      throw e;
    }
  }

  async initTrustchainPublicKey(): Promise<void> {
    // Try to retrieve last block index from the storage
    try {
      const record = await this._ds.get(TABLE_METADATA, TRUSTCHAIN_PUBLIC_KEY);
      this._trustchainPublicKey = record.trustchainPublicKey;
    } catch (e) {
      if (e instanceof dbErrors.RecordNotFound) {
        return;
      }
      throw e;
    }
  }
}
