import { InternalError, InvalidArgument } from '@tanker/errors';

import FilePonyfill from '@tanker/file-ponyfill';
import globalThis from '@tanker/global-this';

import type { Class } from './utils';

export type Data = ArrayBuffer | Blob | Buffer | File | Uint8Array;

type DataName = 'ArrayBuffer' | 'Blob' | 'Buffer' | 'File' | 'FilePonyfill' | 'Uint8Array';

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
    defs.push({ type: FilePonyfill, lengthOf: (arg: typeof FilePonyfill) => arg.size }); // MUST be before Blob
  }

  if (globalThis.Blob !== undefined)
    defs.push({ type: Blob, lengthOf: (arg: Blob) => arg.size });

  return defs;
})();

export const assertNever = (_: never, argName: string): never => {
  throw new InternalError(`assertion error: type error: name: ${argName} [never]`);
};

export function assertDataType(value: unknown, argName: string): asserts value is Data {
  if (!dataTypeDefs.some(def => value instanceof def.type))
    throw new InvalidArgument(argName, 'ArrayBuffer | Blob | Buffer | File | Uint8Array', value);
}

export const assertDataTypeClass = (value: unknown, argName: string): void => {
  if (!dataTypeDefs.some(def => value === def.type))
    throw new InvalidArgument(argName, 'class in [ArrayBuffer | Blob | Buffer | File | Uint8Array]', value);
};

type AssertString = (arg: unknown, argName: string) => asserts arg is string;
export const assertString: AssertString = (arg: unknown, argName: string) => {
  if (typeof arg !== 'string') {
    throw new InvalidArgument(argName, `${argName} should be a string`, arg);
  }
};

export const assertNotEmptyString: AssertString = (arg: unknown, argName: string) => {
  assertString(arg, argName);

  if (arg.length === 0) {
    throw new InvalidArgument(argName, `${argName} should not be empty`, arg);
  }
};

export function assertInteger(arg: unknown, argName: string, isUnsigned: boolean): asserts arg is number {
  if (typeof arg !== 'number') {
    throw new InvalidArgument(argName, `${argName} should be an integer`, arg);
  }

  if (!Number.isFinite(arg) || Math.floor(arg) !== arg) {
    throw new InvalidArgument(argName, `${argName} should be an integer`, arg);
  }

  if (isUnsigned && arg < 0) {
    throw new InvalidArgument(argName, `${argName} should be unsigned`, arg);
  }
}

export const getConstructor = <T extends Data>(instance: T): Class<T> => {
  for (const def of dataTypeDefs) {
    if (instance instanceof def.type) {
      return def.type;
    }
  }

  throw new InternalError('Assertion error: unhandled type');
};

export const getConstructorName = (constructor: Record<string, any>): Exclude<DataName, 'FilePonyfill'> => {
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
      return def.lengthOf(value);
    }
  }

  throw new InternalError('Assertion error: unhandled type');
};
const defaultMime = 'application/octet-stream';

const fromUint8ArrayToFilePonyfill = (
  uint8array: Uint8Array,
  { mime, name, lastModified }: { mime?: string; name?: string; lastModified?: number; } = {},
) => new FilePonyfill(
  [uint8array],
  name || '',
  { type: mime || defaultMime, lastModified: lastModified || Date.now() },
);

const fromUint8ArrayTo: Record<DataName, (uint8array: Uint8Array, options?: { mime?: string }) => Data> = {
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

const toUint8Array = async (value: Data, maxBytes?: number): Promise<Uint8Array> => {
  if (value instanceof Uint8Array) // also matches Buffer instances
    return value;
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value);

  const buffer = await value.slice(0, maxBytes || value.size).arrayBuffer();
  return new Uint8Array(buffer);
};

export async function castData<T extends Data>(
  input: Data,
  options: { type: Class<T> } & ResourceMetadata,
  maxBytes?: number,
): Promise<T> {
  const { type, ...fileOpts } = options;

  if (input instanceof type)
    return input;

  const uint8array = await toUint8Array(input, maxBytes);

  return fromUint8ArrayTo[getConstructorName(type)](uint8array, fileOpts) as T;
}
