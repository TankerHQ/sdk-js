import Dexie from 'dexie';
import { dexieStoreBase } from '@tanker/datastore-dexie-base';

export type { Config } from '@tanker/datastore-dexie-base';

// @ts-expect-error willingly add the `dataStoreName` property
Dexie.dataStoreName = 'DexieBrowser';

export const dexieBrowser = () => dexieStoreBase(Dexie);
