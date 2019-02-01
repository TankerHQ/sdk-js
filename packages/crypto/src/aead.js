// @flow

import sodium from 'libsodium-wrappers';
import * as tcrypto from './tcrypto';
import { random } from './random';
import { concatArrays } from './utils';

export function encryptAEAD(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, associatedData, null, iv, key);
}

export function decryptAEAD(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, associatedData, iv, key);
}

export async function encryptAEADv1(key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const iv = random(tcrypto.XCHACHA_IV_SIZE);
  const ciphertext = encryptAEAD(key, iv, plaintext, associatedData);
  return concatArrays(ciphertext, iv);
}

export async function decryptAEADv1(key: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const rawCiphertext = ciphertext.subarray(0, ciphertext.length - tcrypto.XCHACHA_IV_SIZE);
  const iv = ciphertext.subarray(ciphertext.length - tcrypto.XCHACHA_IV_SIZE);
  return decryptAEAD(key, iv, rawCiphertext, associatedData);
}

export async function encryptAEADv2(key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const iv = random(tcrypto.XCHACHA_IV_SIZE);
  const ciphertext = encryptAEAD(key, iv, plaintext, associatedData);
  return concatArrays(iv, ciphertext);
}

export async function decryptAEADv2(key: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const iv = ciphertext.subarray(0, tcrypto.XCHACHA_IV_SIZE);
  const rawCiphertext = ciphertext.subarray(tcrypto.XCHACHA_IV_SIZE);
  return decryptAEAD(key, iv, rawCiphertext, associatedData);
}

export async function encryptAEADv3(key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
  return encryptAEAD(key, iv, plaintext, associatedData);
}

export async function decryptAEADv3(key: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Promise<Uint8Array> {
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
  return decryptAEAD(key, iv, ciphertext, associatedData);
}

export function extractMac(edata: Uint8Array): Uint8Array {
  if (edata.length < tcrypto.MAC_SIZE)
    throw new Error(`Assertion error: at least ${tcrypto.MAC_SIZE} bytes needed to extract a MAC`);

  return new Uint8Array(edata.subarray(edata.length - tcrypto.MAC_SIZE)); // don't use slice, doesn't work on IE11
}
