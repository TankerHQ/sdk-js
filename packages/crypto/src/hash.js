// @flow
import sodium from 'libsodium-wrappers';

export const HASH_MIN_SIZE = sodium.crypto_generichash_BYTES_MIN;
export const HASH_MAX_SIZE = sodium.crypto_generichash_BYTES_MAX;

export function generichash(data: Uint8Array, bytesize: number = 32): Uint8Array {
  return sodium.crypto_generichash(bytesize, data, null);
}
