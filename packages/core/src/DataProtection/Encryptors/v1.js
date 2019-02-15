// @flow
import { aead, random, tcrypto, utils } from '@tanker/crypto';

export function encrypt(key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
  const iv = random(tcrypto.XCHACHA_IV_SIZE);
  const ciphertext = aead.encryptAEAD(key, iv, plaintext, associatedData);
  return utils.concatArrays(ciphertext, iv);
}

export function decrypt(key: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
  const rawCiphertext = ciphertext.subarray(0, ciphertext.length - tcrypto.XCHACHA_IV_SIZE);
  const iv = ciphertext.subarray(ciphertext.length - tcrypto.XCHACHA_IV_SIZE);
  return aead.decryptAEAD(key, iv, rawCiphertext, associatedData);
}

export function extractResourceId(ciphertext: Uint8Array): Uint8Array {
  return aead.extractMac(ciphertext);
}
