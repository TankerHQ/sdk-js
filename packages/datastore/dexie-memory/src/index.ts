import DexieStoreBase from '@tanker/datastore-dexie-base';
import { DexieMemory } from './dexie-memory';

export type { Config } from '@tanker/datastore-dexie-base';
export default (() => DexieStoreBase(DexieMemory));
