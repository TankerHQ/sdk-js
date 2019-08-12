// @flow
import { utils, tcrypto, aead } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';

import varint from 'varint';

const version = 3;

export type EncryptionData = {
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
  iv: Uint8Array,
};

export const serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array(varint.encode(version)), data.encryptedData);

export const unserialize = (buffer: Uint8Array): EncryptionData => {
  const bufferVersion = varint.decode(buffer);
  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  const encryptedData = buffer.subarray(1);
  const resourceId = aead.extractMac(encryptedData);
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros

  return { encryptedData, resourceId, iv };
};

export const encrypt = (key: Uint8Array, plaintext: Uint8Array, additionalData?: Uint8Array): EncryptionData => {
  const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
  const encryptedData = aead.encryptAEAD(key, iv, plaintext, additionalData);
  const resourceId = aead.extractMac(encryptedData);
  return { encryptedData, iv, resourceId };
};

export const decrypt = (key: Uint8Array, data: EncryptionData): Uint8Array => aead.decryptAEAD(key, data.iv, data.encryptedData);

export const extractResourceId = (buffer: Uint8Array): Uint8Array => aead.extractMac(buffer);

export const overhead = 1 + tcrypto.MAC_SIZE;
