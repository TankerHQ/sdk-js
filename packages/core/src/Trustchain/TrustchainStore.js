// @flow
import { utils, type b64string } from '@tanker/crypto';
import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';

import {
  unserializePayload,
  type Nature,
  NATURE,
} from '../Blocks/payloads';

import type { Entry, UnverifiedEntry } from '../Blocks/entries';

import {
  type Block,
  hashBlock,
} from '../Blocks/Block';

import { InvalidBlockError } from '../errors';

export const rootEntryAuthor = new Uint8Array(32);

export type DbEntry = {|
  index: number,
  nature: Nature,
  author: b64string,
  payload_verified?: Object,
  payload_unverified?: Object,
  user_id?: b64string,
  public_signature_key?: b64string,
  ephemeral_public_signature_key?: b64string,
  user_public_key?: b64string,
  signature: b64string,
  hash: b64string,
|}

export function entryToDbEntry(entry: Entry | UnverifiedEntry): DbEntry {
  // flow doesn't understand that Uint8Array fields from `entry` are overwritten by b64string fields
  // $FlowIssue 0.74 https://github.com/facebook/flow/issues/2816
  return {
    ...entry,
    user_id: entry.user_id ? utils.toBase64(entry.user_id) : null,
    author: utils.toBase64(entry.author),
    public_signature_key: entry.public_signature_key ? utils.toBase64(entry.public_signature_key) : null,
    signature: utils.toBase64(entry.signature),
    hash: utils.toBase64(entry.hash),
  };
}

export function dbEntryToEntry(entry: DbEntry): Entry | UnverifiedEntry {
  // $FlowFixMe there's no way flow is going to know whether it's a Entry or an UnverifiedEntry
  return {
    ...entry,
    user_id: entry.user_id ? utils.fromBase64(entry.user_id) : null,
    author: utils.fromBase64(entry.author),
    public_signature_key: entry.public_signature_key ? utils.fromBase64(entry.public_signature_key) : null,
    signature: utils.fromBase64(entry.signature),
    hash: utils.fromBase64(entry.hash),
  };
}

function dbId(param: Entry | Uint8Array): string {
  const hash = (param instanceof Uint8Array) ? param : param.hash;
  return `block-${utils.toBase64(hash)}`;
}

// transform a raw trustchain block to something we can manipulate.
export function blockToEntry(block: Block): UnverifiedEntry { /* eslint-disable camelcase */
  const payload_unverified = unserializePayload(block);
  // $FlowFixMe flow is right, Record may or may not contain any of these fields
  const { user_id, public_signature_key } = payload_unverified;
  const { index, author, nature, signature } = block;

  const typeSafeNature: Nature = (nature: any);

  return {
    payload_unverified,
    index,
    nature: typeSafeNature,
    author,
    public_signature_key,
    user_id,
    signature,
    hash: hashBlock(block),
  };
}

const TABLE = 'trustchain';
const TABLE_METADATA = 'trustchain_metadata';
const LAST_BLOCK_INDEX_KEY = 'lastBlockIndex';

// basic local trustchain storage
export default class TrustchainStore {
  _ds: DataStore<*>;
  _lastBlockIndex: number;

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

  async setEntryVerified(eEntry: UnverifiedEntry): Promise<Entry> {
    const entry: Object = { ...eEntry };
    try {
      entry.payload_verified = entry.payload_unverified;
      delete entry.payload_unverified;
      await this._ds.put(TABLE, { _id: dbId(entry), ...entryToDbEntry(entry) });
    } catch (e) {
      if (!(e instanceof dbErrors.RecordNotUnique))
        throw new InvalidBlockError('update_failed', 'can not mark block as verified', { entry, e });
    }
    const vEntry: Entry = entry;
    return vEntry;
  }

  async addTrustchainCreation(entry: UnverifiedEntry): Promise<void> {
    if (entry.nature !== NATURE.trustchain_creation)
      throw new Error('Assertion error: Called addTrustchainCreation with an entry of another nature');
    return this._ds.put(TABLE, { _id: dbId(entry.hash), ...entryToDbEntry(entry) });
  }

  async findMaybeVerifiedEntryByHash(hash: Uint8Array): Promise<?(Entry | UnverifiedEntry)> {
    try {
      const res = await this._ds.get(TABLE, dbId(hash));
      return dbEntryToEntry(res);
    } catch (e) {
      if (e instanceof dbErrors.RecordNotFound) {
        return null;
      }
      throw e;
    }
  }

  async getMaybeVerifiedEntryByHash(hash: Uint8Array): Promise<Entry | UnverifiedEntry> {
    const result = await this.findMaybeVerifiedEntryByHash(hash);
    if (!result) {
      throw new Error(`Block ${utils.toBase64(hash)} not found`);
    }
    return result;
  }

  async getVerifiedEntryByHash(hash: Uint8Array): Promise<Entry> {
    const res = await this.getMaybeVerifiedEntryByHash(hash);
    if (!res.payload_verified)
      throw new Error(`Assertion error: entry ${utils.toBase64(hash)} was not verified`);
    return res;
  }

  async isVerified(hash: Uint8Array): Promise<bool> {
    try {
      return !!((await this.getMaybeVerifiedEntryByHash(hash)): Object).payload_verified;
    } catch (e) {
      throw new InvalidBlockError('entry_does_not_exist', 'This entry is not in the trustchain', { hash, e });
    }
  }

  async close(): Promise<void> {
    // $FlowIKnow
    this._ds = null;
    this._lastBlockIndex = 0;
  }

  static async open(ds: DataStore<*>): Promise<TrustchainStore> {
    const trustchain = new TrustchainStore(ds);
    await trustchain.initData();
    return trustchain;
  }

  async initData() {
    await this.initLastBlockIndex();
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
}
