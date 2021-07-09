// @flow
import { type DataStore } from '@tanker/datastore-base';
import { InternalError } from '@tanker/errors';

import { tcrypto, utils, encryptionV2 } from '@tanker/crypto';

const GROUPS_ENCRYPTION_KEYS_TABLE = 'groups_encryption_keys';

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
      name: 'group_encryption_key_pairs',
      indexes: [['publicEncryptionKey']],
    },
  ]
};

const schemaV11 = {
  tables: [
    // Delete all previous tables
    ...schemaV8.tables.map(t => ({ ...t, deleted: true })),
    // And replace by the new table
    {
      name: 'group_encryption_keys',
    },
  ]
};

const schemaV13 = {
  tables: [
    ...schemaV11.tables.map(t => ({ ...t, deleted: true })),
    {
      name: GROUPS_ENCRYPTION_KEYS_TABLE,
      indexes: [['groupId']],
    },
  ]
};

type GroupEncryptionKeyPairRecord = {
  groupId: Uint8Array,
  encryptionKeyPair: tcrypto.SodiumKeyPair,
};

export default class GroupStore {
  declare _ds: DataStore<*>;
  declare _userSecret: Uint8Array;

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
    { version: 11, ...schemaV11 },
    { version: 12, ...schemaV11 },
    { version: 13, ...schemaV13 },
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
    // $FlowIgnore
    this._ds = null;
  }

  saveGroupEncryptionKeys = async (groupKeys: Array<GroupEncryptionKeyPairRecord>) => {
    const b64GroupKeyPairs = groupKeys.map(gk => {
      const encryptedPrivateKey = encryptionV2.serialize(encryptionV2.encrypt(this._userSecret, gk.encryptionKeyPair.privateKey));

      const b64GroupId = utils.toBase64(gk.groupId);
      const b64PublicEncryptionKey = utils.toBase64(gk.encryptionKeyPair.publicKey);
      const b64PrivateEncryptionKey = utils.toBase64(encryptedPrivateKey);

      return { _id: b64PublicEncryptionKey, groupId: b64GroupId, privateEncryptionKey: b64PrivateEncryptionKey };
    });

    await this._ds.bulkAdd(GROUPS_ENCRYPTION_KEYS_TABLE, b64GroupKeyPairs);
  }

  async findGroupEncryptionKeyPair(publicKey: Uint8Array): Promise<?tcrypto.SodiumKeyPair> {
    const b64PublicKey = utils.toBase64(publicKey);

    const existingKey = await this._ds.first(GROUPS_ENCRYPTION_KEYS_TABLE, {
      selector: {
        _id: b64PublicKey,
      }
    });

    if (!existingKey || !existingKey.privateEncryptionKey) {
      return null;
    }

    const encryptedPrivateEncryptionKey = utils.fromBase64(existingKey.privateEncryptionKey);
    const privateKey = encryptionV2.decrypt(this._userSecret, encryptionV2.unserialize(encryptedPrivateEncryptionKey));

    return { publicKey, privateKey };
  }
}
