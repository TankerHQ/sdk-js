import type { DataStore, BaseConfig } from '@tanker/datastore-tests';
import { generateDataStoreTests } from '@tanker/datastore-tests';

import DexieStore from '../index';

const createDataStoreGenerator = () => async (baseConfig: BaseConfig): Promise<DataStore<any>> => DexieStore().open(baseConfig);

generateDataStoreTests('dexie-browser', createDataStoreGenerator());
