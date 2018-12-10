// @flow
import { BaseMergerStream } from '@tanker/stream-base';

const converters = Object.freeze({
  ArrayBuffer: (uint8array) => (
    uint8array.buffer.byteLength === uint8array.length
      ? uint8array.buffer
      : (new Uint8Array(uint8array)).buffer
  ),
  Buffer: (uint8array) => Buffer.from(uint8array.buffer),
  Uint8Array: (uint8array) => uint8array,
});

export default class MergerStream extends BaseMergerStream {
  constructor(options: { type?: string, mime?: string, name?: string } = {}) {
    super({ ...options, converters });
  }
}
