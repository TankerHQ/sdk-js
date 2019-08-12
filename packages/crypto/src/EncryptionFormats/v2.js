// @flow
import { utils, tcrypto, aead, random } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';

import varint from 'varint';

const version = 2;

export type EncryptionData = {
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
  iv: Uint8Array,
};

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

export const overhead = 1 + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE;

export const compatDecrypt = (key: Uint8Array, buffer: Uint8Array, additionalData?: Uint8Array): Uint8Array => {
  try {
    return decrypt(key, unserialize(buffer), additionalData);
  } catch (e) {
    const bufferWithVersion = utils.concatArrays(new Uint8Array([version]), buffer);
    return decrypt(key, unserialize(bufferWithVersion), additionalData);
  }
};

export const compatEncrypt = (key: Uint8Array, clearData: Uint8Array, additionalData?: Uint8Array) => {
  const data = encrypt(key, clearData, additionalData);
  return utils.concatArrays(data.iv, data.encryptedData);
};
