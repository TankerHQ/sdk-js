import { InvalidArgument } from '@tanker/errors';

import * as encryptionV1 from './v1';
import * as encryptionV2 from './v2';
import * as encryptionV3 from './v3';
import * as encryptionV4 from './v4';
import * as encryptionV5 from './v5';
import * as encryptionV6 from './v6';
import * as encryptionV7 from './v7';
import * as encryptionV8 from './v8';

export interface EncryptionFormatReporter {
  getClearSize(encryptedSize: number): number
  getEncryptedSize(clearSize: number): number
}

const encryptionFormats = [undefined, encryptionV1, encryptionV2, encryptionV3, encryptionV4, encryptionV5, encryptionV6, encryptionV7, encryptionV8];

export type Encryptor = Exclude<typeof encryptionFormats[0], undefined>;

// Encryptor have either an `encrypt` or an `encryptChunk` property
export type SimpleEncryptor = Extract<Encryptor, { encrypt: unknown }>;
export type StreamEncryptor = Extract<Encryptor, { encryptChunk: unknown }>;

// The maximum byte size of a resource encrypted with the "simple" algorithms
// (different from v4) is obtained by summing the sizes of:
//  - the version: 1 byte
//  - the MAC: 16 bytes
//  - the IV: 24 bytes
//  - the data: 5 megabytes (libsodium's hard limit)
//
// By reading an input up to this size, we're sure to be able to extract the resource ID.
export const SAFE_EXTRACTION_LENGTH = 1 + 16 + 24 + 5 * (1024 * 1024);

export type EncryptionFormatDescription = {
  version: number;
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

  if (!encryption)
    throw new InvalidArgument(`Unhandled format version ${version} used in encryptedData`);
  if (encryptedData.length < encryption.overhead)
    throw new InvalidArgument(`Truncated encrypted data. Length should be at least ${encryption.overhead} with encryption format v${encryption.version}`);

  return encryption;
};
