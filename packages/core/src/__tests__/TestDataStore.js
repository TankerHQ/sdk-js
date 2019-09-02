// @flow
import PouchDBMemory from '@tanker/datastore-pouchdb-memory';
import { type DataStore, type BaseConfig, type Schema, mergeSchemas } from '@tanker/datastore-base';
import { uuid } from '@tanker/test-utils';

type DataStoreConfig = {|
  ...BaseConfig,
  adapter: Function,
|};

export function makePrefix(length: number = 10) {
  return uuid.v4().replace('-', '').slice(0, length);
}

export const openDataStore = async (config: DataStoreConfig): Promise<DataStore<*>> => {
  const { adapter, ...baseConfig } = config;
  return adapter().open(baseConfig);
};

export function makeMemoryDataStore(schemas: Array<Schema>, dbName: string): Promise<DataStore<*>> {
  const config = { adapter: PouchDBMemory, schemas: mergeSchemas(schemas), dbName: makePrefix() + dbName };
  return openDataStore(config);
}

export default { adapter: PouchDBMemory };
