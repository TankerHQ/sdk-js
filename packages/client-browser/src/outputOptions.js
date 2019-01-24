// @flow
import { getDataType, type Data, type DataType } from './dataHelpers';

export type OutputOptions = { type?: DataType, mime?: string, name?: string, lastModified?: number };

export const makeOutputOptions = (input: Data, options: OutputOptions): { type: DataType } & OutputOptions => {
  const outputType: DataType = options.type || getDataType(input);

  if (outputType === 'ArrayBuffer' || outputType === 'Uint8Array')
    return { type: outputType };

  // outputType is 'Blob' or 'File' starting from here
  const inputDefaults = {};
  if (input instanceof Blob) {
    inputDefaults.mime = input.type;
  }
  if (input instanceof File && outputType === 'File') {
    inputDefaults.name = input.name;
    inputDefaults.lastModified = input.lastModified;
  }

  const optionsDefaults = {};
  if (typeof options.mime === 'string') {
    optionsDefaults.mime = options.mime;
  }
  if (outputType === 'File') {
    if (typeof options.name === 'string') {
      optionsDefaults.name = options.name;
    }
    if (typeof options.lastModified === 'number') {
      optionsDefaults.lastModified = options.lastModified;
    }
  }

  return { ...inputDefaults, ...optionsDefaults, type: outputType };
};
