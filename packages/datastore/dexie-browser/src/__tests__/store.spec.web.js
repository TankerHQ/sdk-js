// @flow
import { generateDataStoreTests, type DataStore, type BaseConfig } from '@tanker/datastore-tests';

import DexieStore from '../index';

const createDataStoreGenerator = () => async (baseConfig: BaseConfig): Promise<DataStore<*>> => DexieStore().open(baseConfig);

generateDataStoreTests('dexie-browser', createDataStoreGenerator());
