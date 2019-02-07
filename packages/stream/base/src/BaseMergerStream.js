// @flow
import { InvalidArgument } from '@tanker/errors';
import ResizerStream from './ResizerStream';
import Uint8Buffer from './Uint8Buffer';

type Destination = ArrayBuffer | Blob | Buffer | File | Uint8Array;
export type Converter<T> = (input: Uint8Array, options?: Object) => T;

export default class BaseMergerStream<T: Destination> extends ResizerStream {
  _buffer: Uint8Buffer = new Uint8Buffer();
  _converter: Converter<T>;
  _converterOptions: Object;
  _type: Class<T>;

  constructor(options: { type: Class<T>, converter: Converter<T> }) {
    // Note: can't use Infinity as it will be forwarded to the writableHighWaterMark option
    super(Number.MAX_SAFE_INTEGER);

    if (!options || typeof options !== 'object' || options instanceof Array)
      throw new InvalidArgument('options', 'object', options);

    const { converter, type, ...converterOptions } = options;
    this._type = type;
    this._converter = converter;
    this._converterOptions = converterOptions;
  }

  _pushLastChunk() {
    if (this._buffer.byteSize()) {
      const uint8array = this._buffer.consume(this._buffer.byteSize());
      const lastChunk = this._converter(uint8array, this._converterOptions);
      this.push(lastChunk);
    }
  }
}
