import DexieMemory from '@tanker/datastore-dexie-memory';
import type { DataStore, BaseConfig, Schema } from '@tanker/datastore-base';
import { mergeSchemas } from '@tanker/datastore-base';
import { uuid } from '@tanker/test-utils';

type DataStoreConfig = BaseConfig & {
  adapter: (...args: Array<any>) => any;
};

export function makePrefix(length: number = 10) {
  return uuid.v4().replace('-', '').slice(0, length);
}

export const openDataStore = async (config: DataStoreConfig): Promise<DataStore<any>> => {
  const { adapter, ...baseConfig } = config;
  return adapter().open(baseConfig);
};

export function makeMemoryDataStore(schemas: Array<Schema>, dbName: string): Promise<DataStore<any>> {
  const config = { adapter: DexieMemory, schemas: mergeSchemas(schemas), dbName: makePrefix() + dbName };
  return openDataStore(config);
}

export default { adapter: DexieMemory };
