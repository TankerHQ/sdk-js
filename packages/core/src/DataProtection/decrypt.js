// @flow

import varint from 'varint';

import { aead } from '@tanker/crypto';
import { InvalidEncryptionFormat } from '../errors';

export async function decryptData(version: number, key: Uint8Array, binaryData: Uint8Array): Promise<Uint8Array> {
  switch (version) {
    case 1:
      return aead.decryptAEADv1(key, binaryData);
    case 2:
      return aead.decryptAEADv2(key, binaryData);
    default:
      throw new InvalidEncryptionFormat(`unhandled format version in decryptData: '${version}'`);
  }
}

export function decryptVersion(key: Uint8Array, cipher: Uint8Array): Promise<Uint8Array> {
  const version = varint.decode(cipher);
  const binaryData = cipher.subarray(varint.decode.bytes);

  return decryptData(version, key, binaryData);
}
