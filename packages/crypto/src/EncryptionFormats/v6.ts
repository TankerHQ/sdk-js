import { InvalidArgument, DecryptionFailed } from '@tanker/errors';
import varint from 'varint';
import { Padding, getPaddedSize, padClearData, removePadding } from '../padding';

import * as aead from '../aead';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';

export type EncryptionData = {
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
  iv: Uint8Array,
};

export const version = 6;

export const features = {
  chunks: false,
  fixedResourceId: false,
};

export const overhead = 1 + tcrypto.MAC_SIZE;

// -1 is the padding byte (0x80)
export const getClearSize = (encryptedSize: number) => encryptedSize - overhead - 1;

export const getEncryptedSize = (clearSize: number, paddingStep?: number | Padding) => getPaddedSize(clearSize, paddingStep) + overhead;

export const serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array(varint.encode(version)), data.encryptedData);

export const unserialize = (buffer: Uint8Array): EncryptionData => {
  const bufferVersion = varint.decode(buffer);
  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  if (buffer.length < overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${overhead} for encryption v6` });
  }

  const encryptedData = buffer.subarray(1);
  const resourceId = aead.extractMac(encryptedData);
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros

  return { encryptedData, resourceId, iv };
};

export const encrypt = (key: Uint8Array, plaintext: Uint8Array, paddingStep?: number | Padding): EncryptionData => {
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
  const paddedData = padClearData(plaintext, paddingStep);
  const associatedData = new Uint8Array([version]);
  const encryptedData = aead.encryptAEAD(key, iv, paddedData, associatedData);
  const resourceId = aead.extractMac(encryptedData);
  return { encryptedData, iv, resourceId };
};

export const decrypt = (key: Uint8Array, data: EncryptionData): Uint8Array => {
  const associatedData = new Uint8Array([version]);
  const paddedData = aead.decryptAEAD(key, data.iv, data.encryptedData, associatedData);
  return removePadding(paddedData);
};

export const extractResourceId = (buffer: Uint8Array): Uint8Array => aead.extractMac(buffer);
