import type { DataStore, BaseConfig } from '@tanker/datastore-tests';
import { generateDataStoreTests } from '@tanker/datastore-tests';
import tmp from 'tmp';

import PouchDBNodeStore from '..';

const createDataStoreGenerator = (dbPath: string) => async (baseConfig: BaseConfig): Promise<DataStore> => {
  const store = PouchDBNodeStore();
  return store.open({ ...baseConfig, dbPath });
};

generateDataStoreTests('pouchdb-node', createDataStoreGenerator(tmp.dirSync().name));
