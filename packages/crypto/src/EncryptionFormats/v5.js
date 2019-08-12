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

export const version = 5;

export const features = {
  chunks: false,
  fixedResourceId: true,
};

export const overhead = 1 + tcrypto.MAC_SIZE + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE;

export const getClearSize = (encryptedSize: number) => encryptedSize - overhead;

export const getEncryptedSize = (clearSize: number) => clearSize + overhead;

export const serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array(varint.encode(version)), data.resourceId, data.iv, data.encryptedData);

export const unserialize = (buffer: Uint8Array): EncryptionData => {
  const bufferVersion = varint.decode(buffer);
  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  let pos = 1;
  const resourceId = buffer.subarray(pos, pos + tcrypto.MAC_SIZE);
  pos += tcrypto.MAC_SIZE;

  const iv = buffer.subarray(pos, pos + tcrypto.XCHACHA_IV_SIZE);
  pos += tcrypto.XCHACHA_IV_SIZE;

  const encryptedData = buffer.subarray(pos);

  return { encryptedData, resourceId, iv };
};

export const encrypt = (key: Uint8Array, plaintext: Uint8Array, resourceId?: Uint8Array): EncryptionData => {
  if (!resourceId) {
    throw new InvalidArgument('Expected a resource ID for encrypt V5');
  }
  const iv = random(tcrypto.XCHACHA_IV_SIZE);

  const encryptedData = aead.encryptAEAD(key, iv, plaintext, resourceId);
  return { encryptedData, iv, resourceId };
};

export const decrypt = (key: Uint8Array, data: EncryptionData): Uint8Array => aead.decryptAEAD(key, data.iv, data.encryptedData, data.resourceId);

export const extractResourceId = (buffer: Uint8Array): Uint8Array => {
  const data = unserialize(buffer);
  return data.resourceId;
};
