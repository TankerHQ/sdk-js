import type { Key } from '../aliases';

export interface KeyMapper {
  findKey(keyID: Uint8Array): Promise<Key> | Key;
}
