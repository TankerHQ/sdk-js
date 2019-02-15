// @flow
import varint from 'varint';

import { InvalidEncryptionFormat } from '../errors';
import { concatArrays } from '../Blocks/Serialize';

import * as v1 from './Encryptors/v1';
import * as v2 from './Encryptors/v2';
import * as v3 from './Encryptors/v3';

const allVersions = [1, 2, 3, 4];
const currentSimpleVersion = 3;

const assertVersion = (version: number) => {
  if (allVersions.indexOf(version) === -1)
    throw new InvalidEncryptionFormat(`unhandled format version: ${version}`);
};

const getEncryptor = (version: number) => {
  switch (version) {
    case 1:
      return v1;
    case 2:
      return v2;
    case 3:
      return v3;
    default:
      throw new Error(`Assertion error: requested simple encryptor with unhandled version ${version}`);
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
      throw new InvalidEncryptionFormat('invalid format version in getEncryptionFormat (bad varint)');
    } else {
      throw err;
    }
  }

  assertVersion(version);

  return { version, versionLength };
}

export function encryptData(key: Uint8Array, clearData: Uint8Array): Uint8Array {
  const encryptedData = getEncryptor(currentSimpleVersion).encrypt(key, clearData);
  const encodedVersion = varint.encode(currentSimpleVersion);
  return concatArrays(encodedVersion, encryptedData);
}

export function decryptData(key: Uint8Array, encryptedData: Uint8Array): Uint8Array {
  const { version, versionLength } = getEncryptionFormat(encryptedData);
  const subData = encryptedData.subarray(versionLength);

  return getEncryptor(version).decrypt(key, subData);
}

export function extractResourceId(encryptedData: Uint8Array): Uint8Array {
  const { version, versionLength } = getEncryptionFormat(encryptedData);
  const subData = encryptedData.subarray(versionLength);

  return getEncryptor(version).extractResourceId(subData);
}
