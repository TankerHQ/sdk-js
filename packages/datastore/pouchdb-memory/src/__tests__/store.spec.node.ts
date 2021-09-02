import type { DataStore, BaseConfig } from '@tanker/datastore-tests';
import { generateDataStoreTests } from '@tanker/datastore-tests';

import PouchDBMemoryStore from '../index';

const createDataStoreGenerator = () => async (baseConfig: BaseConfig): Promise<DataStore<any>> => PouchDBMemoryStore().open({ ...baseConfig });

generateDataStoreTests('pouchdb-memory', createDataStoreGenerator());
