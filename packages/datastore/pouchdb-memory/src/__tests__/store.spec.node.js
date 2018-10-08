// @flow
import { generateDataStoreTests, type DataStore, type BaseConfig } from '@tanker/datastore-tests';

import PouchDBMemoryStore from '../index';

const createDataStoreGenerator = () => async (baseConfig: BaseConfig): Promise<DataStore<*>> => PouchDBMemoryStore().open({ ...baseConfig });

generateDataStoreTests('pouchdb-memory', createDataStoreGenerator());
