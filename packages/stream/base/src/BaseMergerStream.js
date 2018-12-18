// @flow
import { InvalidArgument } from '@tanker/errors';
import ResizerStream from './ResizerStream';
import Uint8Buffer from './Uint8Buffer';

export type Converter<T> = (input: Uint8Array, options: Object) => T;

export default class BaseMergerStream extends ResizerStream {
  _buffer: Uint8Buffer = new Uint8Buffer();
  _converter: Converter<any>;
  _converterOptions: Object;
  _type: string;

  constructor(options: { type?: string, converters: { [className: string]: Converter<any> }}) {
    // Note: can't use Infinity as it will be forwarded to the writableHighWaterMark option
    super(Number.MAX_SAFE_INTEGER);

    if (!options || typeof options !== 'object' || options instanceof Array)
      throw new InvalidArgument('options', 'object', options);

    const { converters, type, ...converterOptions } = options;

    this._converterOptions = converterOptions;

    if (type !== undefined) {
      const allowedTypes = Object.keys(converters);

      if (allowedTypes.indexOf(type) === -1) {
        throw new InvalidArgument('options.type', `string in ${JSON.stringify(allowedTypes)}`, type);
      }
    }

    this._type = type || 'Uint8Array';
    this._converter = converters[this._type];

    if (typeof this._converter !== 'function')
      throw new Error(`Assertion error: missing converter for type ${this._type} in MergerStream`);
  }

  _pushLastChunk() {
    if (this._buffer.byteSize()) {
      const uint8array = this._buffer.consume(this._buffer.byteSize());
      const lastChunk = this._converter(uint8array, this._converterOptions);
      this.push(lastChunk);
    }
  }
}
