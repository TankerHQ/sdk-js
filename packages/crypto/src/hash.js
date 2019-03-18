// @flow
import sodium from 'libsodium-wrappers';

export function generichash(data: Uint8Array, bytesize: number = 32): Uint8Array {
  return sodium.crypto_generichash(bytesize, data, null);
}
