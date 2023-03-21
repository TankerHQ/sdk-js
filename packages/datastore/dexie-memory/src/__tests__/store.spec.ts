import type { DataStore, BaseConfig } from '@tanker/datastore-tests';
import { generateDataStoreTests } from '@tanker/datastore-tests';

import { dexieMemory } from '../index';

const createDataStoreGenerator = () => async (baseConfig: BaseConfig): Promise<DataStore> => dexieMemory().open(baseConfig);

generateDataStoreTests('dexie-memory', createDataStoreGenerator());
