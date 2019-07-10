// @flow
import { InvalidArgument } from '@tanker/errors';
import { Readable } from '@tanker/stream-base';

type Source = ArrayBuffer | Buffer | Uint8Array;

export default class SlicerStream extends Readable {
  _source: Uint8Array;
  _outputSize: number;
  _readingState: {
    byteSize: number,
    byteIndex: number,
  };

  constructor(options: { source: Source, outputSize?: number }) {
    if (!options || typeof options !== 'object' || options instanceof Array)
      throw new InvalidArgument('options', 'object', options);

    const { source, outputSize } = options;

    if ([ArrayBuffer, Buffer, Uint8Array].every(constructor => !(source instanceof constructor)))
      throw new InvalidArgument('options.source', 'either an ArrayBuffer, a Buffer or a Uint8Array', source);

    if (outputSize && typeof outputSize !== 'number')
      throw new InvalidArgument('options.outputSize', 'number', outputSize);

    super({
      // buffering a single output chunk
      objectMode: true,
      highWaterMark: 1,
    });

    this._outputSize = outputSize || 5 * 1024 * 1024; // 5MB

    this._source = !(source instanceof Uint8Array) ? new Uint8Array(source) : source;
    this._readingState = {
      byteSize: this._source.length,
      byteIndex: 0,
    };
  }

  _read = (/* size: number */) => {
    const { byteSize, byteIndex: startIndex } = this._readingState;
    const endIndex = Math.min(startIndex + this._outputSize, byteSize);

    const bytes = this._source.subarray(startIndex, endIndex);
    const pushMore = this.push(bytes);

    if (endIndex >= byteSize) {
      this.push(null);
      return;
    }

    this._readingState.byteIndex = endIndex;

    if (pushMore) {
      this._read();
    }
  }
}
