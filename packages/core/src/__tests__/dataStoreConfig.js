// @flow
import uuid from 'uuid';
import PouchDBMemory from '@tanker/datastore-pouchdb-memory';
import { type DataStore, type BaseConfig } from '@tanker/datastore-base';

type DataStoreConfig = {|
  ...BaseConfig,
  adapter: Function,
|};

export function makePrefix(length: number = 10) {
  return uuid.v4().replace('-', '').slice(0, length);
}

export const openDataStore = async (config: DataStoreConfig): Promise<DataStore<*>> => {
  const { adapter, ...baseConfig } = config;
  // $FlowIKnow
  return adapter().open(baseConfig);
};

export default { adapter: PouchDBMemory };
