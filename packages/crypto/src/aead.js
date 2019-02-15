// @flow
import sodium from 'libsodium-wrappers';
import { MAC_SIZE } from './tcrypto';

export function encryptAEAD(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, associatedData, null, iv, key);
}

export function decryptAEAD(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, associatedData, iv, key);
}

export function extractMac(edata: Uint8Array): Uint8Array {
  if (edata.length < MAC_SIZE)
    throw new Error(`Assertion error: at least ${MAC_SIZE} bytes needed to extract a MAC`);

  return new Uint8Array(edata.subarray(edata.length - MAC_SIZE)); // don't use slice, doesn't work on IE11
}
