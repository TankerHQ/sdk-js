// @flow

import { Transform } from 'readable-stream';

import Uint8Buffer from './Uint8Buffer';

export class Uint8Stream extends Transform {
  _buffer: Uint8Buffer = new Uint8Buffer();
  _outputSize: number;


  constructor(outputSize: number) {
    super({
      writableHighWaterMark: outputSize,
      readableHighWaterMark: 1,
      readableObjectMode: true
    });
    this._outputSize = outputSize;
  }

  _pushChunks() {
    while (this._buffer.byteSize() >= this._outputSize) {
      const result = this._buffer.consume(this._outputSize);
      this.push(result);
    }
  }

  _pushLastChunk() {
    if (this._buffer.byteSize()) {
      const result = this._buffer.consume(this._buffer.byteSize());
      this.push(result);
    }
  }

  _transform(chunk, encoding, callback) {
    this._buffer.push(chunk);
    this._pushChunks();
    callback();
  }

  _flush(callback) {
    this._pushChunks();
    this._pushLastChunk();
    callback();
  }
}
