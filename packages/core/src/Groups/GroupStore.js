// @flow
import { type DataStore } from '@tanker/datastore-base';
import { InternalError } from '@tanker/errors';

import { tcrypto, utils, encryptionV2 } from '@tanker/crypto';

const GROUP_ENCRYPTION_KEY_PAIRS_TABLE = 'group_encryption_key_pairs';

const schemaV3 = {
  tables: [{
    name: 'groups',
    indexes: [['publicEncryptionKey']],
  }]
};

const schemaV7 = {
  tables: [...schemaV3.tables, {
    name: 'groups_pending_encryption_keys',
    indexes: [['publicSignatureKeys']],
  }]
};

const schemaV8 = {
  tables: [
    // Delete all previous tables
    ...schemaV7.tables.map(t => ({ ...t, deleted: true })),
    // And replace by the new table
    {
      name: GROUP_ENCRYPTION_KEY_PAIRS_TABLE,
      indexes: [['publicEncryptionKey']],
    },
  ]
};

type GroupKeyRecord = {
  groupId: Uint8Array,
  publicEncryptionKey: Uint8Array,
}

export default class GroupStore {
  /*:: _ds: DataStore<*>; */
  /*:: _userSecret: Uint8Array; */

  static schemas = [
    // this store didn't exist in schema version 1 and 2
    { version: 1, tables: [] },
    { version: 2, tables: [] },
    { version: 3, ...schemaV3 },
    { version: 4, ...schemaV3 },
    { version: 5, ...schemaV3 },
    { version: 6, ...schemaV3 },
    { version: 7, ...schemaV7 },
    { version: 8, ...schemaV8 },
    { version: 9, ...schemaV8 },
    { version: 10, ...schemaV8 },
  ];

  constructor(ds: DataStore<*>, userSecret: Uint8Array) {
    if (!userSecret)
      throw new InternalError('Invalid user secret');

    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
    Object.defineProperty(this, '_userSecret', { value: userSecret }); // + not writable
  }

  static async open(ds: DataStore<*>, userSecret: Uint8Array): Promise<GroupStore> {
    return new GroupStore(ds, userSecret);
  }

  async close(): Promise<void> {
    // $FlowIKnow
    this._ds = null;
  }

  saveGroupKeyPair = async (groupId: Uint8Array, groupEncryptionKeyPair: tcrypto.SodiumKeyPair) => {
    const encryptedPrivateKey = encryptionV2.serialize(encryptionV2.encrypt(this._userSecret, groupEncryptionKeyPair.privateKey));

    const b64GroupId = utils.toBase64(groupId);
    const b64PublicEncryptionKey = utils.toBase64(groupEncryptionKeyPair.publicKey);
    const b64PrivateEncryptionKey = utils.toBase64(encryptedPrivateKey);

    // We never want to overwrite a key
    const existingKey = await this._ds.first(GROUP_ENCRYPTION_KEY_PAIRS_TABLE, {
      selector: {
        publicEncryptionKey: { $eq: b64PublicEncryptionKey },
      }
    });

    if (existingKey && existingKey.privateEncryptionKey) {
      return;
    }

    await this._ds.put(GROUP_ENCRYPTION_KEY_PAIRS_TABLE, {
      _id: b64GroupId,
      publicEncryptionKey: b64PublicEncryptionKey,
      privateEncryptionKey: b64PrivateEncryptionKey
    });
  }

  saveGroupsPublicKeys = async (groupKeys: Array<GroupKeyRecord>) => {
    const b64GroupIds = [];
    const b64GroupKeys = [];

    groupKeys.forEach(gk => {
      const groupId = utils.toBase64(gk.groupId); //eslint-disable-line no-underscore-dangle
      const publicEncryptionKey = utils.toBase64(gk.publicEncryptionKey);

      b64GroupIds.push(groupId);
      b64GroupKeys.push({ _id: groupId, publicEncryptionKey });
    });

    // We never want to overwrite a key
    const existingB64GroupIds = (await this._ds.find(GROUP_ENCRYPTION_KEY_PAIRS_TABLE, {
      selector: {
        _id: { $in: b64GroupIds },
      }
    })).map(record => record._id); //eslint-disable-line no-underscore-dangle

    const groupKeysToSave = b64GroupKeys.filter(gkr => !existingB64GroupIds.includes(gkr._id)); //eslint-disable-line no-underscore-dangle

    await this._ds.bulkPut(GROUP_ENCRYPTION_KEY_PAIRS_TABLE, groupKeysToSave);
  }

  async findGroupKeyPair(publicKey: Uint8Array): Promise<?tcrypto.SodiumKeyPair> {
    const b64PublicKey = utils.toBase64(publicKey);

    const existingKey = await this._ds.first(GROUP_ENCRYPTION_KEY_PAIRS_TABLE, {
      selector: {
        publicEncryptionKey: { $eq: b64PublicKey },
      }
    });

    if (!existingKey || !existingKey.privateEncryptionKey) {
      return null;
    }

    const encryptedPrivateEncryptionKey = utils.fromBase64(existingKey.privateEncryptionKey);
    const privateKey = encryptionV2.decrypt(this._userSecret, encryptionV2.unserialize(encryptedPrivateEncryptionKey));

    return { publicKey, privateKey };
  }

  async findGroupsPublicKeys(groupIds: Array<Uint8Array>): Promise<Array<GroupKeyRecord>> {
    const records = await this._ds.find(GROUP_ENCRYPTION_KEY_PAIRS_TABLE, {
      selector: {
        _id: { $in: groupIds.map(utils.toBase64) },
      }
    });

    return records.map(r => ({
      groupId: utils.fromBase64(r._id), //eslint-disable-line no-underscore-dangle
      publicEncryptionKey: utils.fromBase64(r.publicEncryptionKey),
    }));
  }
}
