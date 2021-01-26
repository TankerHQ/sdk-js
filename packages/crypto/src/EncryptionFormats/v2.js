// @flow
import { InvalidArgument } from '@tanker/errors';

import varint from 'varint';

import * as aead from '../aead';
import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';

export type EncryptionData = {
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
  iv: Uint8Array,
};

export const version = 2;

export const features = {
  chunks: false,
  fixedResourceId: false,
};

export const overhead = 1 + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE;

export const getClearSize = (encryptedSize: number) => encryptedSize - overhead;

export const getEncryptedSize = (clearSize: number) => clearSize + overhead;

export const serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array(varint.encode(version)), data.iv, data.encryptedData);

export const unserialize = (buffer: Uint8Array): EncryptionData => {
  const bufferVersion = varint.decode(buffer);
  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  const iv = buffer.subarray(1, 1 + tcrypto.XCHACHA_IV_SIZE);
  const encryptedData = buffer.subarray(1 + tcrypto.XCHACHA_IV_SIZE);
  const resourceId = aead.extractMac(encryptedData);
  return { iv, encryptedData, resourceId };
};

export const encrypt = (key: Uint8Array, plaintext: Uint8Array, additionalData?: Uint8Array): EncryptionData => {
  const iv = random(tcrypto.XCHACHA_IV_SIZE);
  const encryptedData = aead.encryptAEAD(key, iv, plaintext, additionalData);
  const resourceId = aead.extractMac(encryptedData);
  return { iv, encryptedData, resourceId };
};

export const decrypt = (key: Uint8Array, data: EncryptionData, additionalData?: Uint8Array): Uint8Array => aead.decryptAEAD(key, data.iv, data.encryptedData, additionalData);

export const extractResourceId = (buffer: Uint8Array): Uint8Array => aead.extractMac(buffer);
