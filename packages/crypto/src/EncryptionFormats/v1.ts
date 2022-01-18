import { InvalidArgument, DecryptionFailed } from '@tanker/errors';

import * as aead from '../aead';
import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';

export type EncryptionData = {
  encryptedData: Uint8Array;
  resourceId: Uint8Array;
  iv: Uint8Array;
};

export const version = 1;

export const features = {
  chunks: false,
  fixedResourceId: false,
};

export const overhead = 1 + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE;

export const getClearSize = (encryptedSize: number) => encryptedSize - overhead;

export const getEncryptedSize = (clearSize: number) => clearSize + overhead;

export const serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array([version]), data.encryptedData, data.iv);

export const unserialize = (buffer: Uint8Array): EncryptionData => {
  const bufferVersion = buffer[0];

  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  if (buffer.length < overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${overhead} for encryption v1` });
  }

  const encryptedData = buffer.subarray(1, buffer.length - tcrypto.XCHACHA_IV_SIZE);
  const iv = buffer.subarray(buffer.length - tcrypto.XCHACHA_IV_SIZE);

  const resourceId = aead.extractMac(buffer);
  return { iv, encryptedData, resourceId };
};

export const encrypt = (key: Uint8Array, plaintext: Uint8Array, associatedData?: Uint8Array): EncryptionData => {
  const iv = random(tcrypto.XCHACHA_IV_SIZE);
  const encryptedData = aead.encryptAEAD(key, iv, plaintext, associatedData);
  const resourceId = aead.extractMac(iv);
  return { encryptedData, iv, resourceId };
};

export function decrypt(key: Uint8Array, data: EncryptionData, associatedData?: Uint8Array): Uint8Array {
  return aead.decryptAEAD(key, data.iv, data.encryptedData, associatedData);
}

export const extractResourceId = (buffer: Uint8Array): Uint8Array => aead.extractMac(buffer);

export const compatDecrypt = (key: Uint8Array, buffer: Uint8Array, additionalData?: Uint8Array): Uint8Array => {
  try {
    return decrypt(key, unserialize(buffer), additionalData);
  } catch (e) {
    const bufferWithVersion = utils.concatArrays(new Uint8Array([version]), buffer);
    return decrypt(key, unserialize(bufferWithVersion), additionalData);
  }
};
