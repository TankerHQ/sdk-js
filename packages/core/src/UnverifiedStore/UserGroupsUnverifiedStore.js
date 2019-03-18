//@flow

import { utils, type b64string } from '@tanker/crypto';
import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';

import { entryToDbEntry, dbEntryToEntry, type VerificationFields } from '../Blocks/entries';
import { type UserGroupCreationRecord, type UserGroupAdditionRecord } from '../Blocks/payloads';
import { natureKind, NATURE_KIND } from '../Blocks/Nature';

const UNVERIFIED_GROUPS_TABLE = 'unverified_user_groups'; // Table that stores our unverified blocks
const ENCRYPTION_KEY_GROUP_ID_TABLE = 'encryption_key_to_group_id';

export type UnverifiedUserGroupCreation = {
  ...VerificationFields,
  ...UserGroupCreationRecord,
  group_id: Uint8Array
};

export type UnverifiedUserGroupAddition = {
  ...VerificationFields,
  ...UserGroupAdditionRecord,
};

export type UnverifiedUserGroup = UnverifiedUserGroupCreation | UnverifiedUserGroupAddition
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

  async addUnverifiedUserGroupEntries(entries: Array<UnverifiedUserGroup>): Promise<void> {
    if (entries.length === 0)
      return;
    const mapEntry = new Map();
    const mapEncKeys = new Map();
    for (const entry of entries) {
      if (natureKind(entry.nature) === NATURE_KIND.user_group_creation) {
        const groupCreation: UnverifiedUserGroupCreation = (entry: any);
        const b64GroupId = utils.toBase64(entry.group_id);

        const dbEntry = entryToDbEntry(entry, b64GroupId);
        delete dbEntry.group_public_encryption_key;
        mapEntry.set(dbEntry._id, dbEntry); // eslint-disable-line no-underscore-dangle

        const dbGroupKey = {
          _id: utils.toBase64(groupCreation.public_encryption_key),
          group_id: b64GroupId,
        };
        mapEncKeys.set(dbGroupKey._id, dbGroupKey); // eslint-disable-line no-underscore-dangle
      } else if (natureKind(entry.nature) === NATURE_KIND.user_group_addition) {
        const groupAddition: UnverifiedUserGroupAddition = (entry: any);
        const dbEntry = entryToDbEntry(entry, utils.toBase64(groupAddition.previous_group_block));
        mapEntry.set(dbEntry._id, dbEntry); // eslint-disable-line no-underscore-dangle
      } else {
        throw new Error('Assertion failure: entry is not a group entry');
      }
    }
    await this._ds.bulkAdd(UNVERIFIED_GROUPS_TABLE, [...mapEntry.values()]);

    if (mapEncKeys.size > 0) {
      await this._ds.bulkPut(ENCRYPTION_KEY_GROUP_ID_TABLE, [...mapEncKeys.values()]);
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

    if (natureKind(userGroupEntry.nature) === NATURE_KIND.user_group_creation) {
      await this._ds.delete(UNVERIFIED_GROUPS_TABLE, utils.toBase64(cast.public_signature_key));
    } else if (natureKind(userGroupEntry.nature) === NATURE_KIND.user_group_addition) {
      await this._ds.delete(UNVERIFIED_GROUPS_TABLE, utils.toBase64(cast.previous_group_block));
    }
  }
}
