// @flow
import { aead, tcrypto } from '@tanker/crypto';

export function encrypt(key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
  return aead.encryptAEAD(key, iv, plaintext, associatedData);
}

export function decrypt(key: Uint8Array, ciphertext: Uint8Array, associatedData?: Uint8Array): Uint8Array {
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
  return aead.decryptAEAD(key, iv, ciphertext, associatedData);
}

export function extractResourceId(ciphertext: Uint8Array): Uint8Array {
  return aead.extractMac(ciphertext);
}
