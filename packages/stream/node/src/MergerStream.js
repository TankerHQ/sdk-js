// @flow
import { BaseMergerStream } from '@tanker/stream-base';

const converters = Object.freeze({
  ArrayBuffer: (uint8array) => uint8array.buffer,
  Buffer: (uint8array) => Buffer.from(uint8array.buffer),
  Uint8Array: (uint8array) => uint8array,
});

export default class MergerStream extends BaseMergerStream {
  constructor(options: { type?: string, mime?: string, filename?: string } = {}) {
    super({ ...options, converters });
  }
}
