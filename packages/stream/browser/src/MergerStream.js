// @flow
import { InvalidArgument } from '@tanker/errors';
import { BaseMergerStream } from '@tanker/stream-base';

import FilePolyfill from './File.polyfill';

const defaultMime = 'application/octet-stream';

const converters = Object.freeze({
  ArrayBuffer: (uint8array) => uint8array.buffer,
  Uint8Array: (uint8array) => uint8array,
  Blob: (uint8array, { mime }) => new Blob([uint8array], { type: mime || defaultMime }),
  File: (uint8array, { filename, mime }) => new FilePolyfill([uint8array], filename || '', { type: mime || defaultMime }),
});

export default class MergerStream extends BaseMergerStream {
  constructor(options: { type?: string, mime?: string, filename?: string } = {}) {
    super({ ...options, converters });

    const { mime, filename } = options;

    if (mime && typeof mime !== 'string')
      throw new InvalidArgument('options.mime', 'string', mime);

    if (filename && typeof filename !== 'string')
      throw new InvalidArgument('options.filename', 'string', filename);
  }
}
