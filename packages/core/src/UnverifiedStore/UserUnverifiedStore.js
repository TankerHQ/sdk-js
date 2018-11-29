//@flow

import { utils, type b64string } from '@tanker/crypto';
import { type DataStore } from '@tanker/datastore-base';
import { entryToDbEntry, dbEntryToEntry, type Entry, type UnverifiedEntry, type VerificationFields } from '../Blocks/entries';
import { type UserDeviceRecord, type DeviceRevocationRecord } from '../Blocks/payloads';
import { natureKind, NATURE_KIND, type Nature } from '../Blocks/Nature';

const TABLE_USER_BLOCKS = 0; // Contains both user devices & revocations
const TABLE_DEVICE_TO_USER = 1; // Maps deviceId to userId, for revocation targets
const TABLE_LAST_INDEXES = 2; // Maps userId to last fetched index, to filter on insert

export type UnverifiedDeviceCreation = {
  ...VerificationFields,
  ...UserDeviceRecord,
};

export type VerifiedDeviceCreation = {
  ...UserDeviceRecord,
  hash: Uint8Array,
  nature: Nature,
  index: number,
};

export type UnverifiedDeviceRevocation = {
  ...VerificationFields,
  ...DeviceRevocationRecord,
  user_id: Uint8Array,
};

export type VerifiedDeviceRevocation = {
  ...DeviceRevocationRecord,
  hash: Uint8Array,
  user_id: Uint8Array,
  nature: Nature,
  index: number,
};

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

  async _storeNewDeviceIdToUserIds(deviceIdToUserId: Map<b64string, b64string>) {
    const entryList = [];
    for (const [deviceId, userId] of deviceIdToUserId) {
      entryList.push({
        _id: deviceId,
        device_id: deviceId,
        user_id: userId,
      });
    }
    await this._ds.bulkAdd(UserUnverifiedStore.tables[TABLE_DEVICE_TO_USER].name, entryList);
  }

  async prepareRevokeUserIds(entries: Array<UnverifiedEntry>): Promise<Map<b64string, b64string>> {
    // Extract and store the new deviceId => userId mappings
    const deviceIdToUserId = new Map();
    for (const entry of entries) {
      if (natureKind(entry.nature) !== NATURE_KIND.device_creation)
        continue;
      const payload = ((entry.payload_unverified: any): UserDeviceRecord);
      deviceIdToUserId.set(utils.toBase64(entry.hash), utils.toBase64(payload.user_id));
    }

    const targetDevicesToQuery: Array<b64string> = [];
    for (const entry of entries) {
      if (natureKind(entry.nature) !== NATURE_KIND.device_revocation)
        continue;
      const payload = ((entry.payload_unverified: any): DeviceRevocationRecord);
      const deviceId = utils.toBase64(payload.device_id);
      if (deviceIdToUserId.get(deviceId))
        continue;
      targetDevicesToQuery.push(deviceId);
    }

    await this._storeNewDeviceIdToUserIds(deviceIdToUserId);

    // Fetch the mappings revocations need (if any)
    if (targetDevicesToQuery.length > 0) {
      const deviceEntries = await this._ds.find(UserUnverifiedStore.tables[TABLE_DEVICE_TO_USER].name, {
        selector: {
          device_id: { $in: targetDevicesToQuery },
        }
      });
      for (const deviceEntry of deviceEntries)
        deviceIdToUserId.set(deviceEntry.device_id, deviceEntry.user_id);
    }

    return deviceIdToUserId;
  }

  async fetchLastIndexes(userIds: Iterator<b64string>): Promise<Map<b64string, ?Object>> {
    const lastIndexes = new Map();
    const indexEntries = await this._ds.find(UserUnverifiedStore.tables[TABLE_LAST_INDEXES].name, {
      selector: {
        user_id: { $in: [...userIds] },
      }
    });
    for (const entry of indexEntries)
      lastIndexes.set(entry.user_id, entry);
    return lastIndexes;
  }

  async addUnverifiedUserEntries(entries: Array<UnverifiedEntry>): Promise<Array<UnverifiedDeviceCreation | UnverifiedDeviceRevocation>> {
    if (entries.length === 0)
      return [];

    const deviceIdToUserId = await this.prepareRevokeUserIds(entries);
    const mapEntry = new Map();
    const lastIndexes = await this.fetchLastIndexes(deviceIdToUserId.values());

    const newUserEntries = [];

    for (const entry of entries) {
      const dbEntry = entryToDbEntry(entry, utils.toBase64(entry.hash));
      const userId = dbEntry.user_id || deviceIdToUserId.get(dbEntry.device_id);
      if (!userId)
        throw new Error('Assertion error: Received garbage user entries that don\'t map to any user ID!');
      const lastIdx = lastIndexes.get(userId);
      if (lastIdx && lastIdx.index >= entry.index)
        continue;

      if (natureKind(entry.nature) === NATURE_KIND.device_revocation)
        dbEntry.user_id = userId;

      newUserEntries.push(dbEntryToEntry(dbEntry));
      mapEntry.set(dbEntry._id, dbEntry); // eslint-disable-line no-underscore-dangle
      lastIndexes.set(dbEntry.user_id, {
        _id: userId,
        user_id: userId,
        index: entry.index,
      });
    }
    const blockEntryList = (([...mapEntry.values()]: any): Array<Entry>);
    const idxEntryList = (([...lastIndexes.values()]: any): Array<Entry>);
    await this._ds.bulkAdd(UserUnverifiedStore.tables[TABLE_USER_BLOCKS].name, blockEntryList);
    await this._ds.bulkPut(UserUnverifiedStore.tables[TABLE_LAST_INDEXES].name, idxEntryList);

    return newUserEntries;
  }

  async findUnverifiedDevicesByHash(deviceIds: Array<Uint8Array>): Promise<Array<UnverifiedDeviceCreation>> {
    const entries = await this._ds.find(UserUnverifiedStore.tables[TABLE_USER_BLOCKS].name, {
      selector: {
        hash: { $in: deviceIds.map(utils.toBase64) },
      }
    });
    return entries.map(dbEntryToEntry);
  }

  async findUnverifiedDeviceRevocationByHash(hash: Uint8Array): Promise<?UnverifiedDeviceRevocation> {
    const entry = await this._ds.first(UserUnverifiedStore.tables[TABLE_USER_BLOCKS].name, {
      selector: {
        hash: utils.toBase64(hash),
      }
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
}
