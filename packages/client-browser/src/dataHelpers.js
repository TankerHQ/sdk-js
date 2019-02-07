// @flow
import { errors } from '@tanker/core';
import FilePonyfill from '@tanker/file-ponyfill';

export type Data = ArrayBuffer | Blob | File | Uint8Array;

export const assertDataType = (value: any, argName: string): void => {
  if (![Uint8Array, Blob, File, ArrayBuffer].some(klass => value instanceof klass))
    throw new errors.InvalidArgument(argName, 'ArrayBuffer | Blob | File | Uint8Array', value);
};

export const getConstructor = <T: Data>(instance: T): * => {
  if (instance instanceof ArrayBuffer)
    return ArrayBuffer;
  else if (instance instanceof Uint8Array)
    return Uint8Array;
  else if (instance instanceof File) // must be before Blob
    return File;
  else if (instance instanceof Blob)
    return Blob;
  throw new Error('Assertion error: unhandled type');
};

const getConstructorName = (constructor): string => {
  if (constructor === ArrayBuffer)
    return 'ArrayBuffer';
  else if (constructor === Uint8Array)
    return 'Uint8Array';
  else if (constructor === File || constructor === FilePonyfill) // must be before Blob
    return 'File';
  else if (constructor === Blob)
    return 'Blob';
  throw new Error('Assertion error: unhandled type');
};

export const getDataLength = (value: Data): number => {
  if (value instanceof ArrayBuffer)
    return value.byteLength;
  else if (value instanceof Uint8Array)
    return value.length;
  else if (value instanceof File || value instanceof Blob)
    return value.size;
  throw new Error('Assertion error: unhandled type');
};

const defaultMime = 'application/octet-stream';

const fromUint8ArrayTo = {
  ArrayBuffer: (uint8array) => (
    uint8array.buffer.byteLength === uint8array.length
      ? uint8array.buffer
      : (new Uint8Array(uint8array)).buffer
  ),
  Uint8Array: (uint8array) => uint8array,
  Blob: (uint8array, { mime } = {}) => new Blob([uint8array], { type: mime || defaultMime }),
  File: (uint8array, { mime, name, lastModified }) => new FilePonyfill(
    [uint8array],
    name || '',
    { type: mime || defaultMime, lastModified: lastModified || Date.now() }
  ),
};

// $FlowIKnow Cross-browser compat
const blobSlice = Blob.prototype.slice || Blob.prototype.mozSlice || Blob.prototype.webkitSlice;

const toUint8Array = async (value: Data, maxSize: ?number): Promise<Uint8Array> => {
  if (value instanceof Uint8Array)
    return value;
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value);

  // value instanceof Blob (File extends Blob)
  const blob: Blob = (value: any);
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.addEventListener('load', (event: any) => resolve(new Uint8Array(event.target.result)));
    reader.addEventListener('error', () => reject(reader.error));
    const byteStart = 0;
    const byteEnd = Math.min(blob.size, maxSize || Number.POSITIVE_INFINITY);
    const byteWindow = blobSlice.call(blob, byteStart, byteEnd);
    reader.readAsArrayBuffer(byteWindow);
  });
};

export async function castData<T: Data>(
  input: Data,
  opts: { type: Class<T>, mime?: string, name?: string, lastModified?: number },
  maxSize: ?number
): Promise<T> {
  const { type, ...outputOpts } = opts;

  if (input instanceof type)
    return input;

  const uint8array = await toUint8Array(input, maxSize);

  if (type === Blob || type === File || type === FilePonyfill)
    return fromUint8ArrayTo[getConstructorName(type)](uint8array, outputOpts);

  return fromUint8ArrayTo[getConstructorName(type)](uint8array);
}
