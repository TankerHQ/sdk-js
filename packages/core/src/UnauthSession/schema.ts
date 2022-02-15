import '@tanker/datastore-base';

export const TABLE_METADATA = 'trustchain_metadata';

const tablesV1 = [{
  name: TABLE_METADATA,
}];

export const globalSchema = [
  { version: 1, tables: tablesV1 },
];
