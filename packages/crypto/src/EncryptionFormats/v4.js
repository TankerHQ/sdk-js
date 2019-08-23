// @flow
import { InvalidArgument } from '@tanker/errors';

import varint from 'varint';

import * as aead from '../aead';
import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import * as number from '../number';

export type EncryptionData = {
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
  ivSeed: Uint8Array,
  encryptedChunkSize: number,
};

const version = 4;
const uint32Length = 4;

export const overhead = 1 + uint32Length + tcrypto.MAC_SIZE + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE;

export const serialize = (data: EncryptionData): Uint8Array => utils.concatArrays(
  new Uint8Array(varint.encode(version)),
  number.toUint32le(data.encryptedChunkSize),
  data.resourceId,
  data.ivSeed,
  data.encryptedData,
);

export const unserialize = (buffer: Uint8Array): EncryptionData => {
  const bufferVersion = varint.decode(buffer);
  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  if (buffer.length < overhead) {
    throw new InvalidArgument('buffer is too short for encryption format v4');
  }

  let pos = 1;
  const encryptedChunkSize = number.fromUint32le(buffer.subarray(pos, pos + uint32Length));
  pos += uint32Length;

  const resourceId = buffer.subarray(pos, pos + tcrypto.MAC_SIZE);
  pos += tcrypto.MAC_SIZE;

  const ivSeed = buffer.subarray(pos, pos + tcrypto.XCHACHA_IV_SIZE);
  pos += tcrypto.XCHACHA_IV_SIZE;

  const encryptedData = buffer.subarray(pos);

  return { ivSeed, encryptedChunkSize, resourceId, encryptedData };
};

export const encrypt = (key: Uint8Array, index: number, resourceId: Uint8Array, encryptedChunkSize: number, clearChunk: Uint8Array): EncryptionData => {
  const ivSeed = random(tcrypto.XCHACHA_IV_SIZE);
  const iv = tcrypto.deriveIV(ivSeed, index);

  const encryptedData = aead.encryptAEAD(key, iv, clearChunk);
  return { ivSeed, encryptedData, resourceId, encryptedChunkSize };
};

export const decrypt = (key: Uint8Array, index: number, data: EncryptionData): Uint8Array => {
  const iv = tcrypto.deriveIV(data.ivSeed, index);
  return aead.decryptAEAD(key, iv, data.encryptedData);
};

export const extractResourceId = (buffer: Uint8Array): Uint8Array => {
  const resourceId = unserialize(buffer).resourceId;
  if (!resourceId) {
    throw new InvalidArgument('Assertion error: no resourceId in buffer');
  }
  return resourceId;
};
