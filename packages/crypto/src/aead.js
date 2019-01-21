// @flow

import sodium from 'libsodium-wrappers';
import * as tcrypto from './tcrypto';
import { random } from './random';
import { concatArrays } from './utils';

export async function encryptAEADv2(key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const iv = random(tcrypto.XCHACHA_IV_SIZE);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, associatedData, null, iv, key);
  return concatArrays(iv, ciphertext);
}

export async function encryptAEADv1(key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const iv = random(tcrypto.XCHACHA_IV_SIZE);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, associatedData, null, iv, key);
  return concatArrays(ciphertext, iv);
}

export async function decryptAEADv1(key: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const rawCiphertext = ciphertext.subarray(0, ciphertext.length - tcrypto.XCHACHA_IV_SIZE);
  const iv = ciphertext.subarray(ciphertext.length - tcrypto.XCHACHA_IV_SIZE);
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, rawCiphertext, associatedData, iv, key);
}

export async function decryptAEADv2(key: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const iv = ciphertext.subarray(0, tcrypto.XCHACHA_IV_SIZE);
  const rawCiphertext = ciphertext.subarray(tcrypto.XCHACHA_IV_SIZE);
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, rawCiphertext, associatedData, iv, key);
}
