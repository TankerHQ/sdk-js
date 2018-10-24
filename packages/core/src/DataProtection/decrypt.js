// @flow

import varint from 'varint';

import { aead } from '@tanker/crypto';
import { InvalidEncryptionFormat } from '../errors';

export async function decryptData(key: Uint8Array, encryptedData: Uint8Array): Promise<Uint8Array> {
  const version = varint.decode(encryptedData);
  const binaryData = encryptedData.subarray(varint.decode.bytes);

  switch (version) {
    case 1:
      return aead.decryptAEADv1(key, binaryData);
    case 2:
      return aead.decryptAEADv2(key, binaryData);
    default:
      throw new InvalidEncryptionFormat(`unhandled format version in decryptData: '${version}'`);
  }
}
