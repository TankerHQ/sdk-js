// @flow
import varint from 'varint';
import { encryptionV1, encryptionV2, encryptionV3 } from '@tanker/crypto';

import { DecryptionFailed, InternalError } from '../errors';

const allVersions = [1, 2, 3, 4];
const currentSimpleVersion = 3;

const assertVersion = (version: number) => {
  if (allVersions.indexOf(version) === -1)
    throw new DecryptionFailed({ message: `unhandled format version: ${version}` });
};

const getEncryptor = (version: number) => {
  switch (version) {
    case 1:
      return encryptionV1;
    case 2:
      return encryptionV2;
    case 3:
      return encryptionV3;
    default:
      throw new InternalError(`Assertion error: requested simple encryptor with unhandled version ${version}`);
  }
};

export function getEncryptionFormat(encryptedData: Uint8Array): { version: number, versionLength: number } {
  let version;
  let versionLength;

  try {
    version = varint.decode(encryptedData);
    versionLength = varint.decode.bytes;
  } catch (err) {
    if (err instanceof RangeError) {
      throw new DecryptionFailed({ message: 'invalid format version in getEncryptionFormat (bad varint)' });
    } else {
      throw err;
    }
  }

  assertVersion(version);

  return { version, versionLength };
}

export function encryptData(key: Uint8Array, clearData: Uint8Array): Uint8Array {
  const encryptor = getEncryptor(currentSimpleVersion);
  return encryptor.serialize(encryptor.encrypt(key, clearData));
}

export function decryptData(key: Uint8Array, encryptedData: Uint8Array): Uint8Array {
  const { version } = getEncryptionFormat(encryptedData);

  const encryptor = getEncryptor(version);
  if (encryptedData.length < encryptor.overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${encryptor.overhead}  with encryption format v${version}` });
  }
  return encryptor.decrypt(key, encryptor.unserialize(encryptedData));
}

export function extractResourceId(encryptedData: Uint8Array): Uint8Array {
  const { version } = getEncryptionFormat(encryptedData);

  const encryptor = getEncryptor(version);
  if (encryptedData.length < encryptor.overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${encryptor.overhead} with encryption format v${version}` });
  }

  return getEncryptor(version).extractResourceId(encryptedData);
}
