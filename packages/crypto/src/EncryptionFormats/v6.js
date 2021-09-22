/* eslint-disable no-bitwise */

// @flow
import { InvalidArgument, DecryptionFailed } from '@tanker/errors';

import varint from 'varint';

import * as aead from '../aead';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';

export type EncryptionData = {
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
  iv: Uint8Array,
};

export const minimalPadding = 10;

export const version = 6;

export const features = {
  chunks: false,
  fixedResourceId: false,
};

export const overhead = 1 + tcrypto.MAC_SIZE;

export const padme = (clearSize: number): number => {
  if (clearSize <= 1)
    return 0;

  const e = Math.floor(Math.log2(clearSize));
  const s = Math.floor(Math.log2(e)) + 1;
  const lastBits = e - s;
  const bitMask = (1 << lastBits) - 1;
  return (clearSize + bitMask) & ~bitMask;
};

export const getPaddedSize = (clearsize: number) => Math.max(padme(clearsize + 1), minimalPadding);

export const getClearSize = (encryptedSize: number) => encryptedSize - overhead;

export const getEncryptedSize = (clearSize: number) => getPaddedSize(clearSize) + overhead;

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

export const padClearData = (plainText: Uint8Array): Uint8Array => {
  const paddedSize = getPaddedSize(plainText.length);
  const paddingArray = new Uint8Array(paddedSize - plainText.length);
  paddingArray[0] = 0x80;
  return utils.concatArrays(plainText, paddingArray);
};

export const encrypt = (key: Uint8Array, plaintext: Uint8Array): EncryptionData => {
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
  const paddedData = padClearData(plaintext);
  const associatedData = new Uint8Array([version]);
  const encryptedData = aead.encryptAEAD(key, iv, paddedData, associatedData);
  const resourceId = aead.extractMac(encryptedData);
  return { encryptedData, iv, resourceId };
};

export const removePadding = (paddedData: Uint8Array): Uint8Array => {
  const index = paddedData.lastIndexOf(0x80);

  if (index === -1 || paddedData.slice(index + 1).findIndex(b => b !== 0x00) !== -1) {
    throw new DecryptionFailed({ message: 'could not remove padding' });
  }

  return paddedData.slice(0, index);
};

export const decrypt = (key: Uint8Array, data: EncryptionData): Uint8Array => {
  const associatedData = new Uint8Array([version]);
  const paddedData = aead.decryptAEAD(key, data.iv, data.encryptedData, associatedData);
  return removePadding(paddedData);
};

export const extractResourceId = (buffer: Uint8Array): Uint8Array => aead.extractMac(buffer);
