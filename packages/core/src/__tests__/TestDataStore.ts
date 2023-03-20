import { dexieMemory } from '@tanker/datastore-dexie-memory';
import type { DataStore, DataStoreAdapter, BaseConfig } from '@tanker/datastore-base';
import { uuid } from '@tanker/test-utils';

type DataStoreConfig = BaseConfig & {
  adapter: (...args: Array<any>) => DataStoreAdapter;
};

export function makePrefix(length: number = 10) {
  return uuid.v4().replace('-', '').slice(0, length);
}

export const openDataStore = async (config: DataStoreConfig): Promise<DataStore> => {
  const { adapter, ...baseConfig } = config;
  return adapter().open(baseConfig);
};

export const dataStoreConfig = { adapter: dexieMemory };
