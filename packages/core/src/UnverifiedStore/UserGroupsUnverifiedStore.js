//@flow

import { utils, type b64string } from '@tanker/crypto';
import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';

import { entryToDbEntry, dbEntryToEntry, type Entry, type UnverifiedEntry, type VerificationFields } from '../Blocks/entries';
import {
  NATURE,
  type UserGroupCreationRecord,
  type UserGroupAdditionRecord,
  type UserGroupRecord,
} from '../Blocks/payloads';

const UNVERIFIED_GROUPS_TABLE = 'unverified_user_groups'; // Table that stores our unverified blocks
const ENCRYPTION_KEY_GROUP_ID_TABLE = 'encryption_key_to_group_id';

export type UnverifiedUserGroup = {
  ...VerificationFields,
  ...UserGroupRecord,
};

export type VerifiedUserGroup = UnverifiedUserGroup

export default class UserGroupsUnverifiedStore {
  _ds: DataStore<*>;

  static tables = [{
    name: UNVERIFIED_GROUPS_TABLE,
    indexes: [['index'], ['group_id']]
  }, {
    name: ENCRYPTION_KEY_GROUP_ID_TABLE,
  }];

  constructor(ds: DataStore<*>) {
    // won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
  }

  static async open(ds: DataStore<*>): Promise<UserGroupsUnverifiedStore> {
    return new UserGroupsUnverifiedStore(ds);
  }

  async close(): Promise<void> {
    // $FlowIKnow
    this._ds = null;
  }

  async addUnverifiedUserGroupEntries(entries: Array<UnverifiedEntry>): Promise<void> {
    if (entries.length === 0)
      return;
    const mapEntry = new Map();
    const mapEncKeys = new Map();
    for (const entry of entries) {
      if (entry.nature === NATURE.user_group_creation) {
        const payload = ((entry.payload_unverified: any): UserGroupCreationRecord);
        const groupId = payload.public_signature_key;
        const b64GroupId = utils.toBase64(groupId);

        const dbEntry = entryToDbEntry({ ...entry, group_id: groupId }, b64GroupId);
        delete dbEntry.group_public_encryption_key;
        mapEntry.set(dbEntry._id, dbEntry); // eslint-disable-line no-underscore-dangle

        const dbGroupKey = {
          _id: utils.toBase64(payload.public_encryption_key),
          group_id: b64GroupId,
        };
        mapEncKeys.set(dbGroupKey._id, dbGroupKey); // eslint-disable-line no-underscore-dangle
      } else if (entry.nature === NATURE.user_group_addition) {
        const payload = ((entry.payload_unverified: any): UserGroupAdditionRecord);
        const dbEntry = entryToDbEntry(entry, utils.toBase64(payload.previous_group_block));
        mapEntry.set(dbEntry._id, dbEntry); // eslint-disable-line no-underscore-dangle
      } else {
        throw new Error('Assertion failure: entry is not a group entry');
      }
    }
    const entryList = (([...mapEntry.values()]: any): Array<Entry>);
    await this._ds.bulkAdd(UNVERIFIED_GROUPS_TABLE, entryList);

    if (mapEncKeys.size > 0) {
      const keysList = (([...mapEncKeys.values()]: any): Array<Object>);
      await this._ds.bulkPut(ENCRYPTION_KEY_GROUP_ID_TABLE, keysList);
    }
  }

  async _findUnverifiedUserGroup(groupId: b64string): Promise<Array<UnverifiedUserGroup>> {
    const entries = await this._ds.find(UNVERIFIED_GROUPS_TABLE, {
      selector: {
        group_id: groupId,
      },
      sort: [{ index: 'asc' }],
    });

    return entries.map(dbEntryToEntry);
  }

  async findUnverifiedUserGroup(groupId: Uint8Array): Promise<Array<UnverifiedUserGroup>> {
    return this._findUnverifiedUserGroup(utils.toBase64(groupId));
  }

  async findUnverifiedUserGroupByPublicEncryptionKey(publicEncryptionKey: Uint8Array): Promise<Array<UnverifiedUserGroup>> {
    try {
      const res = await this._ds.get(ENCRYPTION_KEY_GROUP_ID_TABLE, utils.toBase64(publicEncryptionKey));
      return this._findUnverifiedUserGroup(res.group_id);
    } catch (e) {
      if (e instanceof dbErrors.RecordNotFound) {
        return [];
      }
      throw e;
    }
  }

  async removeVerifiedUserGroupEntry(userGroupEntry: VerifiedUserGroup): Promise<void> {
    const cast: any = userGroupEntry;

    if (userGroupEntry.nature === NATURE.user_group_creation) {
      await this._ds.delete(UNVERIFIED_GROUPS_TABLE, utils.toBase64(cast.public_signature_key));
    } else if (userGroupEntry.nature === NATURE.user_group_addition) {
      await this._ds.delete(UNVERIFIED_GROUPS_TABLE, utils.toBase64(cast.previous_group_block));
    }
  }
}

