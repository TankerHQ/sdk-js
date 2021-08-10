import { Class, $Shape } from 'utility-types';
import { InternalError, InvalidArgument } from '@tanker/errors';
import { utils } from '@tanker/crypto';

import FilePonyfill from '@tanker/file-ponyfill';
import FileReader from '@tanker/file-reader';
import globalThis from '@tanker/global-this';

export type Data = ArrayBuffer | Blob | Buffer | File | Uint8Array;

export type ResourceMetadata = {
  mime?: string;
  name?: string;
  lastModified?: number;
};

// Detect types available in this environment
const dataTypeDefs = (() => {
  const defs = [];
  if (globalThis.ArrayBuffer !== undefined)
    defs.push({ type: ArrayBuffer, lengthOf: (arg: ArrayBuffer) => arg.byteLength });
  if (globalThis.Buffer !== undefined)
    defs.push({ type: Buffer, lengthOf: (arg: Buffer) => arg.length }); // MUST be before Uint8Array
  if (globalThis.Uint8Array !== undefined)
    defs.push({ type: Uint8Array, lengthOf: (arg: Uint8Array) => arg.length });

  if (globalThis.File !== undefined) {
    defs.push({ type: File, lengthOf: (arg: File) => arg.size }); // MUST be before FilePonyfill and Blob
    defs.push({ type: FilePonyfill, lengthOf: (arg: FilePonyfill) => arg.size }); // MUST be before Blob
  }

  if (globalThis.Blob !== undefined)
    defs.push({ type: Blob, lengthOf: (arg: Blob) => arg.size });

  return defs;
})();

export const assertDataType = (value: any, argName: string): void => {
  if (!dataTypeDefs.some(def => value instanceof def.type))
    throw new InvalidArgument(argName, 'ArrayBuffer | Blob | Buffer | File | Uint8Array', value);
};

export const assertDataTypeClass = (value: any, argName: string): void => {
  if (!dataTypeDefs.some(def => value === def.type))
    throw new InvalidArgument(argName, 'class in [ArrayBuffer | Blob | Buffer | File | Uint8Array]', value);
};

export const assertString = (arg: any, argName: string) => {
  if (typeof arg !== 'string') {
    throw new InvalidArgument(argName, `${argName} should be a string`, arg);
  }
};

export const assertNotEmptyString = (arg: any, argName: string) => {
  assertString(arg, argName);

  if (arg.length === 0) {
    throw new InvalidArgument(argName, `${argName} should not be empty`, arg);
  }
};

export const assertInteger = (arg: any, argName: string, isUnsigned: boolean) => {
  if (typeof arg !== 'number') {
    throw new InvalidArgument(argName, `${argName} should be an integer`, arg);
  }

  // Number.isFinite is not supported by IE
  // eslint-disable-next-line no-restricted-globals
  if (!isFinite(arg) || Math.floor(arg) !== arg) {
    throw new InvalidArgument(argName, `${argName} should be an integer`, arg);
  }

  if (isUnsigned && arg < 0) {
    throw new InvalidArgument(argName, `${argName} should be unsigned`, arg);
  }
};

export const assertB64StringWithSize = (arg: any, argName: string, expectedSize: number) => {
  assertNotEmptyString(arg, argName);

  let unb64;

  try {
    unb64 = utils.fromBase64(arg);
  } catch (e) {
    throw new InvalidArgument(argName, `${argName} is not valid base64`, arg);
  }

  if (unb64.length !== expectedSize) {
    throw new InvalidArgument(argName, `${argName} is not the right size, expected ${expectedSize}, got ${unb64.length}`, arg);
  }
};

export const getConstructor = <T extends Data>(instance: T): any => {
  for (const def of dataTypeDefs) {
    if (instance instanceof def.type) {
      return def.type;
    }
  }

  throw new InternalError('Assertion error: unhandled type');
};

export const getConstructorName = (constructor: Record<string, any>): string => {
  if (constructor === ArrayBuffer)
    return 'ArrayBuffer';
  if (globalThis.Buffer && constructor === Buffer)
    return 'Buffer';
  if (constructor === Uint8Array)
    return 'Uint8Array';
  if (globalThis.File && (constructor === File || constructor === FilePonyfill)) // must be before Blob
    return 'File';
  if (globalThis.Blob && constructor === Blob)
    return 'Blob';
  throw new InternalError('Assertion error: unhandled type');
};

export const getDataLength = (value: Data): number => {
  for (const def of dataTypeDefs) {
    if (value instanceof def.type) {
      // $FlowIgnore we checked for the proper type
      return def.lengthOf(value);
    }
  }

  throw new InternalError('Assertion error: unhandled type');
};
const defaultMime = 'application/octet-stream';

const fromUint8ArrayToFilePonyfill = (
  uint8array,
  { mime, name, lastModified }: { mime?: string; name?: string; lastModified?: number; },
) => new FilePonyfill(
  [uint8array],
  name || '',
  { type: mime || defaultMime, lastModified: lastModified || Date.now() },
);

const fromUint8ArrayTo = {
  ArrayBuffer: uint8array => (
    uint8array.buffer.byteLength === uint8array.length
      ? uint8array.buffer
      : new Uint8Array(uint8array).buffer
  ),
  Blob: (uint8array, { mime } = {}) => new Blob([uint8array], { type: mime || defaultMime }),
  Buffer: uint8array => Buffer.from(uint8array),
  File: fromUint8ArrayToFilePonyfill,
  FilePonyfill: fromUint8ArrayToFilePonyfill,
  Uint8Array: uint8array => uint8array,
};

const toUint8Array = async (value: Data, maxBytes: number | null | undefined): Promise<Uint8Array> => {
  if (value instanceof Uint8Array) // also matches Buffer instances
    return value;
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value);

  const reader = new FileReader(value);
  const buffer = await reader.readAsArrayBuffer(maxBytes || value.size);
  return new Uint8Array(buffer);
};

export async function castData<T extends Data>(
  input: Data,
  options: $Shape<{ type: Class<T>; } & ResourceMetadata>,
  maxBytes?: number,
): Promise<T> {
  const { type, ...fileOpts } = options;

  if (input instanceof type)
    return input;

  const uint8array = await toUint8Array(input, maxBytes);

  return fromUint8ArrayTo[getConstructorName(type)](uint8array, fileOpts);
}
