// @flow
import { InvalidArgument } from '@tanker/errors';
import ResizerStream from './ResizerStream';
import Uint8Buffer from './Uint8Buffer';

type Destination = ArrayBuffer | Blob | Buffer | File | Uint8Array;

export type Converter<T> = (input: Uint8Array) => Promise<T>;

export default class BaseMergerStream<T: Destination> extends ResizerStream {
  _buffer: Uint8Buffer = new Uint8Buffer();
  _converter: Converter<T>;

  constructor(converter: Converter<T>) {
    // Note: can't use Infinity as it will be forwarded to the writableHighWaterMark option
    super(Number.MAX_SAFE_INTEGER);

    if (typeof converter !== 'function')
      throw new InvalidArgument('converter', 'function', converter);

    this._converter = converter;
  }

  async _pushLastChunk() {
    if (this._buffer.byteSize()) {
      const uint8array = this._buffer.consume(this._buffer.byteSize());
      const lastChunk = await this._converter(uint8array);
      this.push(lastChunk);
    }
    return Promise.resolve(undefined);
  }
}
