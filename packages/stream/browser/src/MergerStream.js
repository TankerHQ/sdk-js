// @flow
import { InvalidArgument } from '@tanker/errors';
import { BaseMergerStream } from '@tanker/stream-base';
import FilePonyfill from '@tanker/file-ponyfill';

const defaultMime = 'application/octet-stream';

export const getConstructorName = (constructor: Object): string => {
  if (constructor === ArrayBuffer)
    return 'ArrayBuffer';
  if (constructor === Uint8Array)
    return 'Uint8Array';
  if (constructor === File || constructor === FilePonyfill) // must be before Blob
    return 'File';
  // if (constructor === Blob)
  return 'Blob';
};

export type Destination = ArrayBuffer | Blob | File | Uint8Array;
const converters = {
  ArrayBuffer: (uint8array: Uint8Array) => (
    uint8array.buffer.byteLength === uint8array.length
      ? uint8array.buffer
      : (new Uint8Array(uint8array)).buffer
  ),
  Uint8Array: (uint8array: Uint8Array) => uint8array,
  Blob: (uint8array: Uint8Array, { mime }) => new Blob([uint8array], { type: mime || defaultMime }),
  File: (uint8array: Uint8Array, { mime, name, lastModified }) => new FilePonyfill(
    [uint8array],
    name || '',
    { type: mime || defaultMime, lastModified: lastModified || Date.now() }
  ),
};

export default class MergerStream<T: Destination = Uint8Array> extends BaseMergerStream<T> {
  // <T: A | B> is interpreted as 'T must be A or B at all times', not 'T cannot exist unless it is either A or B and should just not change after instantiation'
  // $FlowIssue https://github.com/facebook/flow/issues/7449
  constructor({ type = Uint8Array, mime, name, ...otherOptions }: { type?: Class<T>, mime?: string, name?: string, lastModified?: number } = {}) {
    if (![ArrayBuffer, Blob, File, FilePonyfill, Uint8Array].some(klass => type === klass))
      throw new InvalidArgument('options.type', 'class in [ArrayBuffer, Blob, File, FilePonyfill, Uint8Array]', type);

    if (mime && typeof mime !== 'string')
      throw new InvalidArgument('options.mime', 'string', mime);

    if (name && typeof name !== 'string')
      throw new InvalidArgument('options.name', 'string', name);

    super({ ...otherOptions, type, mime, name, converter: converters[getConstructorName(type)] });
  }
}
