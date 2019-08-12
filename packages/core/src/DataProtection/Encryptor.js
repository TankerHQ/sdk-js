// @flow
import varint from 'varint';
import { encryptionV1, encryptionV2, encryptionV3, encryptionV4, encryptionV5, type Key, random, tcrypto, generichash } from '@tanker/crypto';

import { DecryptionFailed, InternalError } from '../errors';

export type Resource = {
  resourceId: Uint8Array,
  key: Key,
}

export type EncryptedResource = {
  resourceId: Uint8Array,
  key: Key,
  encryptedData: Uint8Array
}

const allVersions = [1, 2, 3, 4, 5];
const simpleVersions = [1, 2, 3, 5];
const currentSimpleVersion = 3;
const currentFixedResourceVersion = 5;

const getVersion = (encryptedData: Uint8Array) => {
  let version;
  try {
    version = varint.decode(encryptedData);
  } catch (e) {
    throw new DecryptionFailed({ message: 'could not decode encryption version' });
  }

  if (allVersions.indexOf(version) === -1)
    throw new DecryptionFailed({ message: `unhandled format version: ${version}` });

  return version;
};

const getEncryptor = (version: number) => {
  switch (version) {
    case 1:
      return encryptionV1;
    case 2:
      return encryptionV2;
    case 3:
      return encryptionV3;
    case 4:
      return encryptionV4;
    case 5:
      return encryptionV5;
    default:
      throw new InternalError(`Assertion error: requested encryptor with unhandled version ${version}`);
  }
};

// Note: Flow won't let us reuse getEncryptor (╥_╥)
const getSimpleEncryptor = (version: number) => {
  switch (version) {
    case 1:
      return encryptionV1;
    case 2:
      return encryptionV2;
    case 3:
      return encryptionV3;
    case 5:
      return encryptionV5;
    default:
      throw new InternalError(`Assertion error: requested simple encryptor with unhandled version ${version}`);
  }
};

export function isSimpleEncryption(encryptedData: Uint8Array) {
  const version = getVersion(encryptedData);
  return simpleVersions.indexOf(version) !== -1;
}

export function makeResource(): Resource {
  const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
  const resourceId = generichash(key, tcrypto.MAC_SIZE);
  return { key, resourceId };
}

export function extractResourceId(encryptedData: Uint8Array): Uint8Array {
  const version = getVersion(encryptedData);

  const encryptor = getEncryptor(version);
  if (encryptedData.length < encryptor.overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${encryptor.overhead} with encryption format v${version}` });
  }

  return encryptor.extractResourceId(encryptedData);
}

export function encryptData(clearData: Uint8Array, resource?: Resource): EncryptedResource {
  if (!resource) {
    const r = makeResource();
    const encryptor = getSimpleEncryptor(currentSimpleVersion);
    const encryptedData = encryptor.serialize(encryptor.encrypt(r.key, clearData));
    return { resourceId: extractResourceId(encryptedData), key: r.key, encryptedData };
  } else {
    const encryptor = getSimpleEncryptor(currentFixedResourceVersion);
    const encryptedData = encryptor.serialize(encryptor.encrypt(resource.key, clearData, resource.resourceId));
    return { resourceId: resource.resourceId, key: resource.key, encryptedData };
  }
}

export function decryptData(key: Uint8Array, encryptedData: Uint8Array): Uint8Array {
  const version = getVersion(encryptedData);

  const encryptor = getSimpleEncryptor(version);
  if (encryptedData.length < encryptor.overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${encryptor.overhead}  with encryption format v${version}` });
  }
  return encryptor.decrypt(key, encryptor.unserialize(encryptedData));
}
