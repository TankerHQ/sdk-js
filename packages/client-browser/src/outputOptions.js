// @flow
import FilePonyfill from '@tanker/file-ponyfill';
import { getConstructor, type Data } from './dataHelpers';

export type OutputOptions<T: Data> = { type?: Class<T>, mime?: string, name?: string, lastModified?: number };

export const makeOutputOptions = <T: Data>(input: Data, options: OutputOptions<T>): { type: Class<T> } & OutputOptions<T> => {
  const outputType = options.type || getConstructor(input);

  if (outputType === ArrayBuffer || outputType === Uint8Array)
    return { type: outputType };

  // outputType is 'Blob' or 'File' starting from here
  const inputDefaults = {};
  if (input instanceof Blob) {
    inputDefaults.mime = input.type;
  }
  if (input instanceof File && (outputType === File || outputType === FilePonyfill)) {
    inputDefaults.name = input.name;
    inputDefaults.lastModified = input.lastModified;
  }

  const optionsDefaults = {};
  if (typeof options.mime === 'string') {
    optionsDefaults.mime = options.mime;
  }
  if (outputType === File || outputType === FilePonyfill) {
    if (typeof options.name === 'string') {
      optionsDefaults.name = options.name;
    }
    if (typeof options.lastModified === 'number') {
      optionsDefaults.lastModified = options.lastModified;
    }
  }

  return { ...inputDefaults, ...optionsDefaults, type: outputType };
};
