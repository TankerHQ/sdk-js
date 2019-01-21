// @flow
import { utils } from '@tanker/crypto';
import { type DataStore } from '@tanker/datastore-base';

import { entryToDbEntry, dbEntryToEntry, type VerificationFields } from '../Blocks/entries';
import { type KeyPublishRecord } from '../Blocks/payloads';

import { type Nature } from '../Blocks/Nature';

const TABLE_BLOCKS = 0; // Table that stores our unverified blocks

export type UnverifiedKeyPublish = {
  ...VerificationFields,
  ...KeyPublishRecord,
};

export type VerifiedKeyPublish = {
  ...KeyPublishRecord,
  author: Uint8Array,
  nature: Nature,
};

export default class KeyPublishUnverifiedStore {
  _ds: DataStore<*>;

  static tables = [{
    name: 'unverified_key_publishes',
    indexes: [['resourceId'], ['nature']]
  }];

  constructor(ds: DataStore<*>) {
    // won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
  }

  static async open(ds: DataStore<*>): Promise<KeyPublishUnverifiedStore> {
    return new KeyPublishUnverifiedStore(ds);
  }

  async close(): Promise<void> {
    // $FlowIKnow
    this._ds = null;
  }

  async addUnverifiedKeyPublishes(entries: Array<UnverifiedKeyPublish>) {
    if (entries.length === 0)
      return;
    const mapEntry = new Map();
    for (const entry of entries) {
      console.log('Adding KP: ', utils.toBase64(entry.resourceId));
      const dbEntry = entryToDbEntry(entry, utils.toBase64(entry.resourceId));
      mapEntry.set(dbEntry._id, dbEntry); // eslint-disable-line no-underscore-dangle
    }
    return this._ds.bulkAdd(KeyPublishUnverifiedStore.tables[TABLE_BLOCKS].name, [...mapEntry.values()]);
  }

  async findUnverifiedKeyPublish(resourceId: Uint8Array): Promise<?UnverifiedKeyPublish> {
    const entry = await this._ds.first(KeyPublishUnverifiedStore.tables[TABLE_BLOCKS].name, {
      selector: {
        resourceId: utils.toBase64(resourceId),
      }
    });
    return entry ? dbEntryToEntry(entry) : null;
  }
}
