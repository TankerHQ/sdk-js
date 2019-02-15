// @flow
import { errors } from '@tanker/core';

export type Data = ArrayBuffer | Buffer | Uint8Array;

export const getConstructor = <T: Data>(instance: T): * => {
  if (instance instanceof ArrayBuffer)
    return ArrayBuffer;
  else if (instance instanceof Buffer) // must be before Uint8Array
    return Buffer;
  else if (instance instanceof Uint8Array)
    return Uint8Array;
  throw new Error('Assertion error: unhandled type');
};

export const assertDataType = (value: any, argName: string): void => {
  if (![ArrayBuffer, Buffer, Uint8Array].some(klass => value instanceof klass))
    throw new errors.InvalidArgument(argName, 'ArrayBuffer | Buffer | Uint8Array', value);
};

const casterMap = {
  ArrayBuffer: (input: Buffer | Uint8Array): ArrayBuffer => (input.buffer.byteLength === input.length ? input.buffer : (new Uint8Array(input)).buffer),
  Buffer: (input: ArrayBuffer | Uint8Array): Buffer => Buffer.from(input instanceof ArrayBuffer ? input : input.buffer),
  Uint8Array: (input: ArrayBuffer | Buffer): Uint8Array => (input instanceof ArrayBuffer ? new Uint8Array(input) : input),
};

export const castData = <T: Data>(input: Data, outputType: Class<T>): T => {
  if (input instanceof outputType)
    return input;

  const caster = casterMap[outputType.name];
  if (!caster)
    throw new errors.InvalidArgument('outputType', 'ArrayBuffer.prototype | Buffer.prototype | Uint8Array.prototype', outputType.name);

  return caster(input);
};
