import type { DataStore, TableSchema } from '@tanker/datastore-base';

import '@tanker/datastore-base';
import { InternalError } from '@tanker/errors';

import type { b64string } from '@tanker/crypto';
import { tcrypto, utils, EncryptionV2 } from '@tanker/crypto';

const GROUPS_ENCRYPTION_KEYS_TABLE = 'groups_encryption_keys';

const tablesV3 = [{
  name: 'groups',
  indexes: [['publicEncryptionKey']],
}];

const tablesV7 = [...tablesV3, {
  name: 'groups_pending_encryption_keys',
  indexes: [['publicSignatureKeys']],
}];

const tablesV8 = [
  // Delete all previous tables
  ...tablesV7.map<TableSchema>(t => ({ ...t, deleted: true })),
  // And replace by the new table
  {
    name: 'group_encryption_key_pairs',
    indexes: [['publicEncryptionKey']],
  },
];

const tablesV9 = tablesV8.filter(t => !t.deleted);

const tablesV11 = [
  // Delete all previous tables
  ...tablesV9.map<TableSchema>(t => ({ ...t, deleted: true })),
  // And replace by the new table
  {
    name: 'group_encryption_keys',
  },
];

const tablesV12 = tablesV11.filter(t => !t.deleted);

const tablesV13 = [
  ...tablesV12.map<TableSchema>(t => ({ ...t, deleted: true })),
  {
    name: GROUPS_ENCRYPTION_KEYS_TABLE,
    indexes: [['groupId']],
  },
];

const tablesV14 = tablesV13.filter(t => !t.deleted);

type GroupPublicEncryptionKeyRecord = {
  groupId: b64string;
  publicEncryptionKey: Uint8Array;
};

type GroupEncryptionKeyPairRecord = GroupPublicEncryptionKeyRecord & { privateEncryptionKey: Uint8Array; };

type GroupEntry = {
  _id: b64string; // publicEncryptionKey
  groupId: b64string;
  privateEncryptionKey?: b64string;
};

export class GroupStore {
  declare _ds: DataStore;
  declare _userSecret: Uint8Array;
  static schemas = [
    // this store didn't exist in schema version 1 and 2
    { version: 1, tables: [] },
    { version: 2, tables: [] },
    { version: 3, tables: tablesV3 },
    { version: 4, tables: tablesV3 },
    { version: 5, tables: tablesV3 },
    { version: 6, tables: tablesV3 },
    { version: 7, tables: tablesV7 },
    { version: 8, tables: tablesV8 },
    { version: 9, tables: tablesV9 },
    { version: 10, tables: tablesV9 },
    { version: 11, tables: tablesV11 },
    { version: 12, tables: tablesV12 },
    { version: 13, tables: tablesV13 },
    { version: 14, tables: tablesV14 },
  ];

  constructor(ds: DataStore, userSecret: Uint8Array) {
    if (!userSecret)
      throw new InternalError('Invalid user secret');

    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
    Object.defineProperty(this, '_userSecret', { value: userSecret }); // + not writable
  }

  static async open(ds: DataStore, userSecret: Uint8Array): Promise<GroupStore> {
    return new GroupStore(ds, userSecret);
  }

  async close(): Promise<void> {
    // @ts-expect-error
    this._ds = null;
  }

  saveGroupPublicEncryptionKeys = async (groupPublicKeys: Array<GroupPublicEncryptionKeyRecord>): Promise<void> => {
    const b64groupPK = groupPublicKeys.map(gpk => ({ _id: utils.toBase64(gpk.publicEncryptionKey), groupId: gpk.groupId }));
    const knownGroupEntries = await this._findGroupsByGroupId(b64groupPK.map(g => g.groupId));
    const knownGroups: Record<string, boolean> = {};

    for (const entry of knownGroupEntries) {
      knownGroups[entry.groupId] = true;
    }

    // We never want duplicate groupIds
    const toInsert = b64groupPK.filter(gk => !knownGroups[gk.groupId]);

    // bulkAdd never inserts duplicate `_id`
    await this._ds.bulkAdd(GROUPS_ENCRYPTION_KEYS_TABLE, toInsert);
  };

  _canUpdateEntry(record: GroupEntry, knownEntry?: GroupEntry): boolean {
    // keep new record
    if (!knownEntry) {
      return true;
    }

    // keep unset privateKeys where entries `groupId` and `_id` match
    return !knownEntry.privateEncryptionKey
        && record._id === knownEntry._id // eslint-disable-line no-underscore-dangle
        && record.groupId === knownEntry.groupId;
  }

  saveGroupEncryptionKeys = async (groupKeys: Array<GroupEncryptionKeyPairRecord>) => {
    const b64groupKeys = groupKeys.map(gk => {
      const encryptedPrivateKey = EncryptionV2.serialize(EncryptionV2.encrypt(this._userSecret, gk.privateEncryptionKey));
      return {
        _id: utils.toBase64(gk.publicEncryptionKey),
        groupId: gk.groupId,
        privateEncryptionKey: utils.toBase64(encryptedPrivateKey),
      };
    });

    const knownGroupIdEntries = await this._findGroupsByGroupId(b64groupKeys.map(g => g.groupId));
    const knownGroupIds: Record<string, GroupEntry> = {};

    for (const entry of knownGroupIdEntries) {
      knownGroupIds[entry.groupId] = entry;
    }

    // eslint-disable-next-line no-underscore-dangle
    const knownIdEntries = await this._findGroupsByPublicKey(b64groupKeys.map(g => g._id));
    const knownIds: Record<string, GroupEntry> = {};

    for (const entry of knownIdEntries) {
      knownIds[entry.groupId] = entry;
    }

    const toInsert = b64groupKeys.filter(
      gk => this._canUpdateEntry(gk, knownGroupIds[gk.groupId]),
    ).filter(
      gk => this._canUpdateEntry(gk, knownIds[gk._id]), // eslint-disable-line no-underscore-dangle
    );

    await this._ds.bulkPut(GROUPS_ENCRYPTION_KEYS_TABLE, toInsert);
  };

  async findGroupEncryptionKeyPair(b64PublicKey: b64string): Promise<tcrypto.SodiumKeyPair | null> {
    const existingKey = await this._ds.first(GROUPS_ENCRYPTION_KEYS_TABLE, {
      selector: {
        _id: b64PublicKey,
      },
    });

    if (!existingKey || !existingKey['privateEncryptionKey']) {
      return null;
    }

    const encryptedPrivateEncryptionKey = utils.fromBase64(existingKey['privateEncryptionKey']!);
    const privateKey = await EncryptionV2.decrypt(() => this._userSecret, EncryptionV2.unserialize(encryptedPrivateEncryptionKey));

    return { publicKey: utils.fromBase64(b64PublicKey), privateKey };
  }

  async findGroupsPublicKeys(groupIds: Array<b64string>): Promise<Array<GroupPublicEncryptionKeyRecord>> {
    const records = await this._findGroupsByGroupId(groupIds);

    return records.map(r => ({
      groupId: r.groupId,
      publicEncryptionKey: utils.fromBase64(r._id), //eslint-disable-line no-underscore-dangle
    }));
  }

  async _findGroupsByGroupId(groupIds: Array<b64string>): Promise<Array<GroupEntry>> {
    return this._ds.find(GROUPS_ENCRYPTION_KEYS_TABLE, {
      selector: {
        groupId: { $in: groupIds },
      },
    }) as Promise<Array<GroupEntry>>;
  }

  async _findGroupsByPublicKey(Ids: Array<b64string>): Promise<Array<GroupEntry>> {
    return this._ds.find(GROUPS_ENCRYPTION_KEYS_TABLE, {
      selector: {
        _id: { $in: Ids },
      },
    }) as Promise<Array<GroupEntry>>;
  }
}
