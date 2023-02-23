import type { TableSchema } from '@tanker/datastore-base';
import '@tanker/datastore-base';

export const TABLE_METADATA = 'trustchain_metadata';

const tablesV1 = [{
  name: 'trustchain',
  indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac']],
}];

const tablesV2 = [{
  name: 'trustchain',
  indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac'], ['user_public_key'], ['group_public_encryption_key']],
}, {
  name: 'users',
  indexes: [['userId']],
}, {
  name: 'devices_to_user',
  indexes: [['deviceId']],
}, {
  name: 'user_public_key_to_user',
  indexes: [['userPublicKey']],
}];

const tablesV3 = [
  {
    name: 'trustchain',
    indexes: [['index'], ['user_id'], ['public_signature_key'], ['hash'], ['nature'], ['mac'], ['user_public_key'], ['group_public_encryption_key'], ['group_id']],
  },
  {
    name: TABLE_METADATA,
  },
  {
    name: 'unverified_key_publishes',
    indexes: [['resourceId'], ['nature']],
  },
  {
    name: 'users',
    indexes: [['userId']],
  },
  {
    name: 'devices_to_user',
    indexes: [['deviceId']],
  },
  {
    name: 'user_public_key_to_user',
    indexes: [['userPublicKey']],
  },
];

const tablesV4 = [
  ...tablesV3,
  {
    name: 'unverified_user_groups',
    indexes: [['index'], ['group_id']],
  },
  {
    name: 'encryption_key_to_group_id',
  },
  {
    name: 'unverified_user_entries',
    indexes: [['hash'], ['user_id'], ['index']],
  },
  {
    name: 'device_to_user',
    indexes: [['device_id']],
  },
  {
    name: 'user_last_indexes',
    indexes: [['user_id']],
  },
];

const tablesV6 = [
  ...tablesV4, {
    name: 'unverified_invite_claims',
    indexes: [['index'], ['user_id']],
  }];

const tablesV8 = tablesV6.map<TableSchema>(def => {
  const deleted = ['unverified_user_groups', 'encryption_key_to_group_id'].includes(def.name);
  return deleted ? { ...def, deleted: true } : def;
});

const tablesV9 = tablesV8.filter(def => !def.deleted).map<TableSchema>(def => {
  const deleted = [
    'trustchain',
    'unverified_key_publishes',
    'unverified_user_entries',
    'device_to_user',
    'user_last_indexes',
    'unverified_invite_claims',
  ].includes(def.name);
  return deleted ? { ...def, deleted: true } : def;
});

const tablesV10 = tablesV9.filter(def => !def.deleted);

const tablesV12 = tablesV10.map<TableSchema>(def => {
  const deleted = [
    'users',
    'devices_to_user',
    'user_public_key_to_user',
  ].includes(def.name);
  return deleted ? { ...def, deleted: true } : def;
});

const tablesV13 = tablesV12.filter(def => !def.deleted);

export const globalSchema = [
  { version: 1, tables: tablesV1 },
  { version: 2, tables: tablesV2 },
  { version: 3, tables: tablesV3 },
  { version: 4, tables: tablesV4 },
  { version: 5, tables: tablesV4 },
  { version: 6, tables: tablesV6 },
  { version: 7, tables: tablesV6 },
  { version: 8, tables: tablesV8 },
  { version: 9, tables: tablesV9 },
  { version: 10, tables: tablesV10 },
  { version: 11, tables: tablesV10 },
  { version: 12, tables: tablesV12 },
  { version: 13, tables: tablesV13 },
  { version: 14, tables: tablesV13 },
];
