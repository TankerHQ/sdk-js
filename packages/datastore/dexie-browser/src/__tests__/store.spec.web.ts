import type { DataStore, BaseConfig } from '@tanker/datastore-tests';
import { generateDataStoreTests } from '@tanker/datastore-tests';

import { dexieBrowser } from '../index';

const createDataStoreGenerator = () => async (baseConfig: BaseConfig): Promise<DataStore> => dexieBrowser().open(baseConfig);

generateDataStoreTests('dexie-browser', createDataStoreGenerator());
