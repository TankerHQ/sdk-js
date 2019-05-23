//@flow

import { utils, type b64string } from '@tanker/crypto';
import { type DataStore } from '@tanker/datastore-base';
import { entryToDbEntry, dbEntryToEntry } from '../../Blocks/entries';
import type { UnverifiedDeviceCreation, VerifiedDeviceCreation, UnverifiedDeviceRevocation, VerifiedDeviceRevocation } from '../../Blocks/entries';
import { isDeviceCreation } from '../../Blocks/Nature';

const TABLE_USER_BLOCKS = 0; // Contains both user devices & revocations
const TABLE_DEVICE_TO_USER = 1; // Maps deviceId to userId, for revocation targets
const TABLE_LAST_INDEXES = 2; // Maps userId to last fetched index, to filter on insert

export default class UserUnverifiedStore {
  _ds: DataStore<*>;

  static tables = [{
    name: 'unverified_user_entries',
    indexes: [['hash'], ['user_id'], ['index']]
  }, {
    name: 'device_to_user',
    indexes: [['device_id']]
  }, {
    name: 'user_last_indexes',
    indexes: [['user_id']]
  }];

  constructor(ds: DataStore<*>) {
    // won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
  }

  static async open(ds: DataStore<*>): Promise<UserUnverifiedStore> {
    return new UserUnverifiedStore(ds);
  }

  async close(): Promise<void> {
    // $FlowIKnow
    this._ds = null;
  }

  async _fetchLastIndexes(userIds: Array<b64string>): Promise<Map<b64string, number>> {
    const indexEntries = await this._ds.find(UserUnverifiedStore.tables[TABLE_LAST_INDEXES].name, {
      selector: {
        user_id: { $in: userIds },
      }
    });
    const lastIndexes = new Map();
    indexEntries.forEach(indexEntry => lastIndexes.set(indexEntry.user_id, indexEntry.index));
    return lastIndexes;
  }

  async addUnverifiedUserEntries(entries: Array<UnverifiedDeviceCreation | UnverifiedDeviceRevocation>) {
    if (entries.length === 0)
      return;

    const lastIndexes = await this._fetchLastIndexes(entries.map(e => utils.toBase64(e.user_id)));

    const newUserEntries = [];
    const deviceIdToUserId = [];
    const newIndexes = new Map();

    entries.forEach(entry => {
      const lastIdx = lastIndexes.get(utils.toBase64(entry.user_id));
      if (lastIdx && lastIdx >= entry.index)
        return;

      const b64UserId = utils.toBase64(entry.user_id);

      if (isDeviceCreation(entry.nature)) {
        const b64DeviceId = utils.toBase64(entry.hash);
        deviceIdToUserId.push({
          _id: b64DeviceId,
          device_id: b64DeviceId,
          user_id: b64UserId,
        });
      }
      newIndexes.set(b64UserId, {
        _id: b64UserId,
        user_id: b64UserId,
        index: entry.index,
      });
      newUserEntries.push(entryToDbEntry(entry, utils.toBase64(entry.hash)));
    });

    await this._ds.bulkAdd(UserUnverifiedStore.tables[TABLE_USER_BLOCKS].name, newUserEntries);
    await this._ds.bulkAdd(UserUnverifiedStore.tables[TABLE_DEVICE_TO_USER].name, deviceIdToUserId);
    await this._ds.bulkPut(UserUnverifiedStore.tables[TABLE_LAST_INDEXES].name, [...newIndexes.values()]);
  }

  async findUnverifiedDevicesByHash(deviceIds: Array<Uint8Array>): Promise<Array<UnverifiedDeviceCreation>> {
    const entries = await this._ds.find(UserUnverifiedStore.tables[TABLE_USER_BLOCKS].name, {
      selector: {
        hash: { $in: deviceIds.map(utils.toBase64) },
      },
      sort: [{ index: 'asc' }],
    });
    return entries.map(dbEntryToEntry);
  }

  async findUnverifiedDeviceRevocationByHash(hash: Uint8Array): Promise<?UnverifiedDeviceRevocation> {
    const entry = await this._ds.first(UserUnverifiedStore.tables[TABLE_USER_BLOCKS].name, {
      selector: {
        hash: utils.toBase64(hash),
      },
      sort: [{ index: 'asc' }],
    });
    return entry ? dbEntryToEntry(entry) : null;
  }

  async findUnverifiedUserEntries(userIds: Array<Uint8Array>, stopBeforeIndex?: number): Promise<Array<UnverifiedDeviceCreation | UnverifiedDeviceRevocation>> {
    const selector: Object = {
      user_id: { $in: userIds.map(utils.toBase64) },
    };
    if (stopBeforeIndex !== undefined)
      selector.index = { $lt: stopBeforeIndex };
    const entries = await this._ds.find(UserUnverifiedStore.tables[TABLE_USER_BLOCKS].name, {
      selector,
      sort: [{ index: 'asc' }],
    });
    return entries.map(dbEntryToEntry);
  }

  async removeVerifiedUserEntries(entries: $ReadOnlyArray<VerifiedDeviceCreation | VerifiedDeviceRevocation>): Promise<void> {
    for (const entry of entries) {
      await this._ds.delete(UserUnverifiedStore.tables[TABLE_USER_BLOCKS].name, utils.toBase64(entry.hash));
    }
  }

  async getUserIdFromDeviceId(deviceId: Uint8Array): Promise<?Uint8Array> {
    const deviceToUser = await this._ds.first(UserUnverifiedStore.tables[TABLE_DEVICE_TO_USER].name, {
      selector: {
        device_id: { $eq: utils.toBase64(deviceId) },
      }
    });
    if (deviceToUser) {
      return utils.fromBase64(deviceToUser.user_id);
    }
    return null;
  }
}
