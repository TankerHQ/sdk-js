import { Transform } from 'readable-stream';

import Uint8Buffer from './Uint8Buffer';
import type { DoneCallback } from './types';

// If we need to reduce the buffered memory an implementation may be found on commit
// a021aba46ba1f7eada53666b14c758b0a253d7d3 (this commit never made it to master)
// it was inspired by the following stackoverflow comment:
// - https://stackoverflow.com/a/43811543
//
// The current implementation holds at most 3x the input chunk size.
// The implem from a021aba46ba1f7eada53666b14c758b0a253d7d3 used at most 2x.

export default class ResizerStream extends Transform {
  _buffer: Uint8Buffer;
  _outputSize: number;

  constructor(outputSize: number) {
    super({
      // buffering input bytes until outputSize is reached
      writableHighWaterMark: outputSize,
      writableObjectMode: false,
      // buffering a single output chunk
      readableHighWaterMark: 1,
      readableObjectMode: true,
    });
    this._buffer = new Uint8Buffer();
    this._outputSize = outputSize;
  }

  _pushChunks() {
    while (this._buffer.byteSize() >= this._outputSize) {
      const result = this._buffer.consume(this._outputSize);

      this.push(result);
    }
  }

  async _pushLastChunk() {
    if (this._buffer.byteSize()) {
      const result = this._buffer.consume(this._buffer.byteSize());

      this.push(result);
    }
  }

  _transform(chunk: Uint8Array, encoding?: string | undefined, done: DoneCallback) {
    this._buffer.push(chunk);
    this._pushChunks();
    done();
  }

  async _flush(done: DoneCallback) {
    this._pushChunks();

    try {
      await this._pushLastChunk();
    } catch (error) {
      done(error);
      return;
    }

    done();
  }
}
