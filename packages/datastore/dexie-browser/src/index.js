// @flow
import Dexie from 'dexie';
import DexieStoreBase from '@tanker/datastore-dexie-base';

export type { Config } from '@tanker/datastore-dexie-base';

Dexie.dataStoreName = 'DexieBrowser';

export default () => DexieStoreBase(Dexie);
