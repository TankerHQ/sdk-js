// @flow
import { InvalidArgument } from '@tanker/errors';
import { BaseMergerStream } from '@tanker/stream-base';
import FilePonyfill from '@tanker/file-ponyfill';

const defaultMime = 'application/octet-stream';

const converters = Object.freeze({
  ArrayBuffer: (uint8array) => (
    uint8array.buffer.byteLength === uint8array.length
      ? uint8array.buffer
      : (new Uint8Array(uint8array)).buffer
  ),
  Uint8Array: (uint8array) => uint8array,
  Blob: (uint8array, { mime }) => new Blob([uint8array], { type: mime || defaultMime }),
  File: (uint8array, { mime, name, lastModified }) => new FilePonyfill(
    [uint8array],
    name || '',
    { type: mime || defaultMime, lastModified: lastModified || Date.now() }
  ),
});

export default class MergerStream extends BaseMergerStream {
  constructor(options: { type?: string, mime?: string, name?: string, lastModified?: number } = {}) {
    super({ ...options, converters });

    const { mime, name } = options;

    if (mime && typeof mime !== 'string')
      throw new InvalidArgument('options.mime', 'string', mime);

    if (name && typeof name !== 'string')
      throw new InvalidArgument('options.name', 'string', name);
  }
}
