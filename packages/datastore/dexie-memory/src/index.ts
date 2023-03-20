import { dexieStoreBase } from '@tanker/datastore-dexie-base';
import { DexieMemory } from './dexie-memory';

export type { Config } from '@tanker/datastore-dexie-base';
export const dexieMemory = () => dexieStoreBase(DexieMemory);
