import { InvalidArgument } from '@tanker/errors';

import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import * as aead from '../aead';
import { random } from '../random';
import * as number from '../number';
import type { Padding } from '../padding';
import { paddedFromClearSize } from '../padding';

const uint32Length = 4;

export type EncryptionData = {
  encryptedData: Uint8Array;
  resourceId: Uint8Array;
  ivSeed: Uint8Array;
  encryptedChunkSize: number;
};

export const version = 8;

export const features = {
  chunks: true,
  fixedResourceId: true,
};

export const overhead = 1 + uint32Length + tcrypto.MAC_SIZE + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE + 1;

export const defaultMaxEncryptedChunkSize = 1024 * 1024; // 1MB

export const getClearSize = (encryptedSize: number, maxEncryptedChunkSize: number = defaultMaxEncryptedChunkSize) => {
  const chunkCount = Math.ceil(encryptedSize / maxEncryptedChunkSize);
  return encryptedSize - chunkCount * overhead;
};

export const getEncryptedSize = (clearSize: number, padding?: number | Padding, maxEncryptedChunkSize: number = defaultMaxEncryptedChunkSize) => {
  const paddedSize = paddedFromClearSize(clearSize, padding) - 1;
  const maxClearChunkSize = maxEncryptedChunkSize - overhead;
  // Note: if clearSize is multiple of maxClearChunkSize, an additional empty chunk is added
  //       at the end, hence the +1 to compute chunkCount
  const chunkCount = Math.ceil((paddedSize + 1) / maxClearChunkSize);
  return paddedSize + chunkCount * overhead;
};

export const serialize = (data: EncryptionData): Uint8Array => utils.concatArrays(
  new Uint8Array([version]),
  number.toUint32le(data.encryptedChunkSize),
  data.resourceId,
  data.ivSeed,
  data.encryptedData,
);

export const unserialize = (buffer: Uint8Array): EncryptionData => {
  const bufferVersion = buffer[0];

  if (bufferVersion !== version) {
    throw new InvalidArgument(`expected buffer version to be ${version}, was ${bufferVersion}`);
  }

  if (buffer.length < overhead) {
    throw new InvalidArgument('buffer is too short for encryption format v8');
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

export const encryptChunk = (key: Uint8Array, index: number, resourceId: Uint8Array, encryptedChunkSize: number, clearChunk: Uint8Array): EncryptionData => {
  const ivSeed = random(tcrypto.XCHACHA_IV_SIZE);
  const iv = tcrypto.deriveIV(ivSeed, index);

  const headerData = { version, encryptedChunkSize, resourceId, ivSeed, encryptedData: new Uint8Array() };
  const associatedData = serialize(headerData);

  const encryptedData = aead.encryptAEAD(key, iv, clearChunk, associatedData);
  return { ivSeed, encryptedData, resourceId, encryptedChunkSize };
};

export const decryptChunk = (key: Uint8Array, index: number, data: EncryptionData): Uint8Array => {
  const headerData = { ...data, encryptedData: new Uint8Array() };
  const associatedData = serialize(headerData);
  const iv = tcrypto.deriveIV(data.ivSeed, index);
  return aead.decryptAEAD(key, iv, data.encryptedData, associatedData);
};

export const extractResourceId = (buffer: Uint8Array): Uint8Array => {
  const resourceId = unserialize(buffer).resourceId;

  if (!resourceId) {
    throw new InvalidArgument('Assertion error: no resourceId in buffer');
  }

  return resourceId;
};
