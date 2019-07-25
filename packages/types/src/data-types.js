// @flow
import { errors } from '@tanker/core';
import FilePonyfill from '@tanker/file-ponyfill';
import FileReader from '@tanker/file-reader';

/* eslint-disable */
const __global = (() => {
  if (typeof window !== 'undefined')
    return window;

  if (typeof WorkerGlobalScope !== 'undefined')
    return self;

  if (typeof global !== 'undefined')
    return global;

  // $FlowIKnow Unorthodox call of Function
  return Function('return this;')();
})();
/* eslint-enable */

export type Data = ArrayBuffer | Blob | Buffer | File | Uint8Array;

// Detect types available in this environment
const dataTypeDefs = (() => {
  const defs = [];
  if (__global.ArrayBuffer !== undefined)
    defs.push({ type: ArrayBuffer, lengthOf: (arg: ArrayBuffer) => arg.byteLength });
  if (__global.Buffer !== undefined)
    defs.push({ type: Buffer, lengthOf: (arg: Buffer) => arg.length }); // MUST be before Uint8Array
  if (__global.Uint8Array !== undefined)
    defs.push({ type: Uint8Array, lengthOf: (arg: Uint8Array) => arg.length });
  if (__global.File !== undefined) {
    defs.push({ type: File, lengthOf: (arg: File) => arg.size }); // MUST be before FilePonyfill and Blob
    defs.push({ type: FilePonyfill, lengthOf: (arg: FilePonyfill) => arg.size }); // MUST be before Blob
  }
  if (__global.Blob !== undefined)
    defs.push({ type: Blob, lengthOf: (arg: Blob) => arg.size });
  return defs;
})();

export const assertDataType = (value: any, argName: string): void => {
  if (!dataTypeDefs.some(def => value instanceof def.type))
    throw new errors.InvalidArgument(argName, 'ArrayBuffer | Blob | Buffer | File | Uint8Array', value);
};

export const getConstructor = <T: Data>(instance: T): * => {
  for (const def of dataTypeDefs) {
    if (instance instanceof def.type) {
      return def.type;
    }
  }
  throw new errors.InternalError('Assertion error: unhandled type');
};

export const getConstructorName = (constructor: Object): string => {
  if (constructor === ArrayBuffer)
    return 'ArrayBuffer';
  if (__global.Buffer && constructor === Buffer)
    return 'Buffer';
  else if (constructor === Uint8Array)
    return 'Uint8Array';
  else if (__global.File && (constructor === File || constructor === FilePonyfill)) // must be before Blob
    return 'File';
  else if (__global.Blob && constructor === Blob)
    return 'Blob';
  else
    throw new errors.InternalError('Assertion error: unhandled type');
};

export const getDataLength = (value: Data): number => {
  for (const def of dataTypeDefs) {
    if (value instanceof def.type) {
      // $FlowIKnow we checked for the proper type
      return def.lengthOf(value);
    }
  }
  throw new errors.InternalError('Assertion error: unhandled type');
};

const defaultMime = 'application/octet-stream';

const fromUint8ArrayToFilePonyfill = (
  uint8array,
  { mime, name, lastModified }: { mime?: string, name?: string, lastModified?: number }
) => new FilePonyfill(
  [uint8array],
  name || '',
  { type: mime || defaultMime, lastModified: lastModified || Date.now() }
);

const fromUint8ArrayTo = {
  ArrayBuffer: (uint8array) => (
    uint8array.buffer.byteLength === uint8array.length
      ? uint8array.buffer
      : (new Uint8Array(uint8array)).buffer
  ),
  Blob: (uint8array, { mime } = {}) => new Blob([uint8array], { type: mime || defaultMime }),
  Buffer: (uint8array) => Buffer.from(uint8array),
  File: fromUint8ArrayToFilePonyfill,
  FilePonyfill: fromUint8ArrayToFilePonyfill,
  Uint8Array: (uint8array) => uint8array,
};

const toUint8Array = async (value: Data, maxBytes: ?number): Promise<Uint8Array> => {
  if (value instanceof Uint8Array) // also matches Buffer instances
    return value;
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value);

  const reader = new FileReader(value);
  const buffer = await reader.readAsArrayBuffer(maxBytes || value.size);
  return new Uint8Array(buffer);
};

export async function castData<T: Data>(
  input: Data,
  options: { type: Class<T>, mime?: string, name?: string, lastModified?: number },
  maxBytes?: number,
): Promise<T> {
  const { type, ...fileOpts } = options;

  if (input instanceof type)
    return input;

  const uint8array = await toUint8Array(input, maxBytes);

  return fromUint8ArrayTo[getConstructorName(type)](uint8array, fileOpts);
}
