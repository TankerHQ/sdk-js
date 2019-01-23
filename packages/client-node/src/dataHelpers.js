// @flow
import { errors } from '@tanker/core';

export type Data = ArrayBuffer | Buffer | Uint8Array;
export type DataType = 'ArrayBuffer' | 'Buffer' | 'Uint8Array';

export const getDataType = (value: any, argName: string = 'encryptedData'): DataType => {
  if (value instanceof ArrayBuffer)
    return 'ArrayBuffer';
  else if (value instanceof Buffer) // must be before Uint8Array
    return 'Buffer';
  else if (value instanceof Uint8Array)
    return 'Uint8Array';
  else
    throw new errors.InvalidArgument(argName, 'ArrayBuffer | Buffer | Uint8Array', value);
};

// Notes:
//  - casting is always done by passing a shared memory buffer (no copy)
//  - Buffer extends Uint8Array
export const castData = (input: Data, outputType: DataType): Data => {
  const inputType = getDataType(input);

  if (inputType === outputType) return input;

  switch (outputType) {
    case 'ArrayBuffer':
      // $FlowIKnow input is Buffer or Uint8Array
      return input.buffer;
    case 'Buffer':
      // $FlowIKnow input is ArrayBuffer or Uint8Array
      return Buffer.from(inputType === 'ArrayBuffer' ? input : input.buffer);
    case 'Uint8Array':
      // input is ArrayBuffer or Buffer
      return inputType === 'ArrayBuffer' ? new Uint8Array(input) : input;
    default:
      throw new errors.InvalidArgument('outputType', '"ArrayBuffer" | "Buffer" | "Uint8Array"', outputType);
  }
};
