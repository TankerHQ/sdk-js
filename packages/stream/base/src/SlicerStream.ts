import { Readable } from 'readable-stream';

// WARNING: don't import the File ponyfill here! We want to test against the real
//          File constructor, for both real and ponyfilled files to be accepted.
import { InvalidArgument } from '@tanker/errors';
import { assertDataType } from '@tanker/types';
import type { Data } from '@tanker/types';

export default class SlicerStream extends Readable {
  _outputSize: number = 5 * 1024 * 1024; // 5MB
  _readChunk!: (startIndex: number, endIndex: number) => Promise<Uint8Array> | Uint8Array;
  _readingState = {
    byteSize: 0,
    byteIndex: 0,
    readInProgress: false,
  };

  constructor(options: { source: Data; outputSize?: number; }) {
    super({
      // buffering a single output chunk
      objectMode: true,
      highWaterMark: 1,
    });

    if (!options || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype)
      throw new InvalidArgument('options', 'object', options);

    const { source, outputSize } = options;

    assertDataType(source, 'options.source');

    if (outputSize && typeof outputSize !== 'number')
      throw new InvalidArgument('options.outputSize', 'number', outputSize);

    if (outputSize) {
      this._outputSize = outputSize;
    }

    if (source instanceof ArrayBuffer || source instanceof Uint8Array) { // also catches Buffer
      const src: Uint8Array = source instanceof ArrayBuffer ? new Uint8Array(source) : source;
      this._readingState.byteSize = src.length;
      this._readChunk = (startIndex: number, endIndex: number) => src.subarray(startIndex, endIndex);
    } else {
      this._readingState.byteSize = source.size;
      this._readChunk = async (startIndex: number, endIndex: number) => new Uint8Array(
        await source.slice(startIndex, endIndex).arrayBuffer(),
      );
    }
  }

  override _read = async (/* size: number */) => {
    if (this._readingState.readInProgress)
      return;
    this._readingState.readInProgress = true;

    try {
      let pushMore = true;

      while (pushMore) {
        const { byteSize, byteIndex: startIndex } = this._readingState;
        const endIndex = Math.min(startIndex + this._outputSize, byteSize);

        const buffer = await this._readChunk(startIndex, endIndex);

        if (buffer.length) {
          pushMore = this.push(buffer);
          this._readingState.byteIndex += buffer.length;
        }

        if (this._readingState.byteIndex === byteSize) {
          pushMore = false;
          this.push(null);
        }
      }
    } catch (error) {
      this.destroy(error as Error);
    }

    this._readingState.readInProgress = false;
  };
}
