// @flow

import { type DataStore } from '@tanker/datastore-base';
import { InternalError } from '@tanker/errors';

const GROUPS_TABLE = 'groups';
const GROUPS_PROVISIONAL_ENCRYPTION_KEYS_TABLE = 'groups_pending_encryption_keys';

const schemaV3 = {
  tables: [{
    name: GROUPS_TABLE,
    indexes: [['publicEncryptionKey']],
  }]
};

const schemaV7 = {
  tables: [...schemaV3.tables, {
    name: GROUPS_PROVISIONAL_ENCRYPTION_KEYS_TABLE,
    indexes: [['publicSignatureKeys']],
  }]
};

export default class GroupStore {
  /*:: _ds: DataStore<*>; */
  /*:: _userSecret: Uint8Array; */

  static schemas = [
    // this store didn't exist in schema version 1 and 2
    { version: 1, tables: [] },
    { version: 2, tables: [] },
    {
      version: 3,
      ...schemaV3
    },
    {
      version: 4,
      ...schemaV3
    },
    {
      version: 5,
      ...schemaV3
    },
    {
      version: 6,
      ...schemaV3
    },
    {
      version: 7,
      ...schemaV7
    },
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
}
