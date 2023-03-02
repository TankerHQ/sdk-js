import type { Key } from '../aliases';

type MaybePromise<T> = T | Promise<T>;

export type KeyMapper = (keyID: Uint8Array) => MaybePromise<Key | null>;
