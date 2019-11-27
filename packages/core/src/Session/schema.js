// @flow
import { type TableSchema } from '@tanker/datastore-base';

export const TABLE_METADATA = 'trustchain_metadata';

const tablesV1 = [{
  name: 'trustchain',
  indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac']]
}];

const tablesV2 = [{
  name: 'trustchain',
  indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac'], ['user_public_key'], ['group_public_encryption_key']]
}];

const tablesV3 = [
  {
    name: 'trustchain',
    indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac'], ['user_public_key'], ['group_public_encryption_key'], ['group_id']]
  },
  {
    name: TABLE_METADATA,
  },
  {
    name: 'unverified_key_publishes',
    indexes: [['resourceId'], ['nature']]
  }
];

const tablesV4 = [
  ...tablesV3,
  {
    name: 'unverified_user_groups',
    indexes: [['index'], ['group_id']]
  }, {
    name: 'encryption_key_to_group_id',
  },
  {
    name: 'unverified_user_entries',
    indexes: [['hash'], ['user_id'], ['index']]
  }, {
    name: 'device_to_user',
    indexes: [['device_id']]
  }, {
    name: 'user_last_indexes',
    indexes: [['user_id']]
  }
];

const tablesV6 = [
  ...tablesV4,
  {
    name: 'unverified_invite_claims',
    indexes: [['index'], ['user_id']]
  }];

const tablesV8 = tablesV6.map<TableSchema>(def => {
  const deleted = ['unverified_user_groups', 'encryption_key_to_group_id'].indexOf(def.name) !== -1;
  return deleted ? ({ ...def, deleted: true }) : def;
});

const tablesV9 = tablesV8.filter(def => !def.deleted).map<TableSchema>(def => {
  const deleted = [
    'trustchain',
    'unverified_key_publishes',
    'unverified_user_entries',
    'device_to_user',
    'user_last_indexes',
    'unverified_invite_claims',
  ].indexOf(def.name) !== -1;
  return deleted ? ({ ...def, deleted: true }) : def;
});

export const GlobalSchema = [
  { version: 1, tables: tablesV1 },
  { version: 2, tables: tablesV2 },
  { version: 3, tables: tablesV3 },
  { version: 4, tables: tablesV4 },
  { version: 5, tables: tablesV4 },
  { version: 6, tables: tablesV6 },
  { version: 7, tables: tablesV6 },
  { version: 8, tables: tablesV8 },
  { version: 9, tables: tablesV9 },
];
