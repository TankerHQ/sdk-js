import sodium from 'libsodium-wrappers';
import { InvalidArgument } from '@tanker/errors';

import { EncryptionV1 } from './v1';
import { EncryptionV2 } from './v2';
import { EncryptionV3 } from './v3';
import { EncryptionV4 } from './v4';
import { EncryptionV5 } from './v5';
import { EncryptionV6 } from './v6';
import { EncryptionV7 } from './v7';
import { EncryptionV8 } from './v8';
import { EncryptionV9, EncryptionV10, EncryptionV11 } from './TransparentEncryption';

export interface EncryptionFormatReporter {
  getClearSize(encryptedSize: number): number
  getEncryptedSize(clearSize: number): number
}

export type SimpleEncryptor = typeof EncryptionV1 | typeof EncryptionV2 | typeof EncryptionV3 | typeof EncryptionV5 | typeof EncryptionV6 | typeof EncryptionV7;
export type StreamEncryptor = typeof EncryptionV4 | typeof EncryptionV8;
export type TransparentSessionEncryptor = typeof EncryptionV9 | typeof EncryptionV10;
export type TransparentSessionStreamEncryptor = typeof EncryptionV11;
export type Encryptor = SimpleEncryptor | StreamEncryptor | TransparentSessionEncryptor | TransparentSessionStreamEncryptor;

const encryptionFormats = [undefined, EncryptionV1, EncryptionV2, EncryptionV3, EncryptionV4, EncryptionV5, EncryptionV6, EncryptionV7, EncryptionV8, EncryptionV9, EncryptionV10, EncryptionV11] as const;

// The maximum byte size of a resource encrypted with the "simple" algorithms
// (different from v4 & v8) is obtained by summing the sizes of:
//  - the largest format overhead (currently v9 & v10)
//  - the data: 5 megabytes (max size for simple encryption)
// By reading an input up to this size, we're sure to be able to extract the resource ID.
export const SAFE_EXTRACTION_LENGTH = EncryptionV10.overhead + 5 * (1024 * 1024);

export type EncryptionFormatDescription = {
  version: Encryptor['version'];
  encryptedChunkSize?: number;
};

export const getClearSize = (encryptionFormatDescription: EncryptionFormatDescription, encryptedSize: number): number => {
  const encryption = encryptionFormats[encryptionFormatDescription.version];
  if (!encryption)
    throw new InvalidArgument(`Unhandled format version ${encryptionFormatDescription.version} used in encryptedData`);

  return encryption.getClearSize(encryptedSize, encryptionFormatDescription.encryptedChunkSize);
};

export const extractEncryptionFormat = (encryptedData: Uint8Array) => {
  if (encryptedData.length < 1)
    throw new InvalidArgument('Could not decode encryption version from encryptedData');
  const version = encryptedData[0]!;

  const encryption = encryptionFormats[version];

  if (!encryption) {
    const headerHex = sodium.to_hex(encryptedData.slice(0, 5));
    throw new InvalidArgument(`Unhandled format version ${version} used in encryptedData. Header starts with: 0x${headerHex}`);
  }
  if (encryptedData.length < encryption.overhead)
    throw new InvalidArgument(`Truncated encrypted data. Length should be at least ${encryption.overhead} with encryption format v${encryption.version}`);

  return encryption;
};

export function isStreamEncryptionFormat(encryptor: Encryptor): encryptor is StreamEncryptor {
  return encryptor.features.chunks;
}
