// @flow
import { InvalidArgument } from '@tanker/errors';
import { ResizerStream, Uint8Buffer } from '@tanker/stream-base';

type OutputType = 'ArrayBuffer' | 'Buffer' | 'Uint8Array';

export default class MergerStream extends ResizerStream {
  _buffer: Uint8Buffer = new Uint8Buffer();
  _type: OutputType;

  constructor(options: { type?: OutputType } = {}) {
    if (typeof options !== 'object' || options instanceof Array)
      throw new InvalidArgument('options', 'object', options);

    const { type } = options;

    if (type !== undefined) {
      const allowedTypes = ['ArrayBuffer', 'Buffer', 'Uint8Array'];

      if (allowedTypes.indexOf(type) === -1) {
        throw new InvalidArgument('options.type', 'string in ["ArrayBuffer", "Buffer", "Uint8Array"]', type);
      }
    }

    // Note: can't use Infinity as it will be forwarded to the writableHighWaterMark option
    super(Number.MAX_SAFE_INTEGER);

    this._type = type || 'Uint8Array';
  }

  _pushLastChunk() {
    if (this._buffer.byteSize()) {
      const uint8array = this._buffer.consume(this._buffer.byteSize());

      switch (this._type) {
        case 'ArrayBuffer':
          this.push(uint8array.buffer);
          break;
        case 'Buffer':
          this.push(Buffer.from(uint8array.buffer));
          break;
        case 'Uint8Array':
          this.push(uint8array);
          break;
        default:
          throw new Error('Assertion error: invalid _type in MergerStream');
      }
    }
  }
}
