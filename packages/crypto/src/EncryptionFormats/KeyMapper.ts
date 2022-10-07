import type { Key } from '../aliases';

export type KeyMapper = (keyID: Uint8Array) => Promise<Key> | Key;
