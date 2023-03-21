import type { DataStore, BaseConfig } from '@tanker/datastore-tests';
import { generateDataStoreTests } from '@tanker/datastore-tests';

import { pouchDBMemory } from '../index';

const createDataStoreGenerator = () => async (baseConfig: BaseConfig): Promise<DataStore> => pouchDBMemory().open({ ...baseConfig });

generateDataStoreTests('pouchdb-memory', createDataStoreGenerator());
