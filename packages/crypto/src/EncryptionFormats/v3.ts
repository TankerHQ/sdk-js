import { InvalidArgument, DecryptionFailed } from '@tanker/errors';

import * as aead from '../aead';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';

export type EncryptionData = {
  encryptedData: Uint8Array;
  resourceId: Uint8Array;
  iv: Uint8Array;
};

export const version = 3;

export const features = {
  chunks: false,
  fixedResourceId: false,
};

export const overhead = 1 + tcrypto.MAC_SIZE;

export const getClearSize = (encryptedSize: number) => encryptedSize - overhead;

export const getEncryptedSize = (clearSize: number) => clearSize + overhead;

export const serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array([version]), data.encryptedData);

export const unserialize = (buffer: Uint8Array): EncryptionData => {
  const bufferVersion = buffer[0];

  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  if (buffer.length < overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${overhead} for encryption v3` });
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
