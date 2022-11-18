import { InvalidArgument } from '@tanker/errors';
import { Transform } from '@tanker/stream-base';
import type { TransformCallback } from '@tanker/stream-base';

import * as number from './number';
import * as utils from './utils';
import type { Padding } from './padding';
import { paddedFromClearSize } from './padding';

export class PadStream extends Transform {
  _clearChunkSize: number;
  _paddedChunkSize: number;
  _paddingStep?: number | Padding;
  _bytesProcessed: number;
  _paddingLeft: number | null;
  _lastChunkSize: number;
  _full: boolean;

  // sizeof int32 to hold nb padding bytes
  overhead = number.uint32ByteSize;

  constructor(maxClearChunkSize: number, paddingStep: undefined | number | Padding) {
    super({
      // buffering a single input chunk ('drain' can pull more)
      writableHighWaterMark: 1,
      writableObjectMode: true,
      // buffering a single output chunk
      readableHighWaterMark: 1,
      readableObjectMode: true,
    });

    this._clearChunkSize = maxClearChunkSize;
    this._paddedChunkSize = this._clearChunkSize + this.overhead;
    this._paddingStep = paddingStep;
    this._bytesProcessed = 0;
    this._lastChunkSize = 0;
    this._paddingLeft = null;
    this._full = false;
  }

  override _transform(clearData: Uint8Array, _: BufferEncoding, done: TransformCallback) {
    if (this._full) {
      done(new InvalidArgument('Last chunk already processed'));
      return;
    }

    if (!(clearData instanceof Uint8Array)) {
      done(new InvalidArgument('clearData', 'Uint8Array', clearData));
      return;
    }

    if (clearData.length > this._clearChunkSize) {
      done(new InvalidArgument('clearData.length', `every chunk must be at most ${this._clearChunkSize} long`, clearData.length));
      return;
    }

    let chunkPadding = 0;
    this._bytesProcessed += clearData.length;
    this._lastChunkSize = clearData.length;

    if (clearData.length < this._clearChunkSize) {
      this._full = true;
      const paddingLeft = this._computePadding();
      chunkPadding = Math.min(this._clearChunkSize - clearData.length, paddingLeft);

      this._lastChunkSize += chunkPadding;
      this._paddingLeft = paddingLeft - chunkPadding;
    }

    this.push(utils.concatArrays(
      number.toUint32le(chunkPadding),
      new Uint8Array(chunkPadding),
      clearData,
    ));

    done();
  }

  override _flush(done: TransformCallback) {
    if (this._paddingLeft === null) {
      this._paddingLeft = this._computePadding();
    }

    const paddedData = new Uint8Array(this.paddedChunkSize());
    paddedData.set(number.toUint32le(this._clearChunkSize));
    while (this._paddingLeft >= this._clearChunkSize) {
      this._paddingLeft -= this._clearChunkSize;
      this._lastChunkSize = this._clearChunkSize;
      this.push(paddedData);
    }

    if (this._paddingLeft !== 0) {
      this.push(utils.concatArrays(
        number.toUint32le(this._paddingLeft),
        new Uint8Array(this._paddingLeft),
      ));
    }

    done();
  }

  _computePadding() {
    // ignore 0x80 accounted by `paddedFromClearSize()`
    return paddedFromClearSize(this._bytesProcessed, this._paddingStep) - 1 - this._bytesProcessed;
  }

  paddedChunkSize() {
    return this._paddedChunkSize;
  }

  emptyChunk() {
    return number.toUint32le(0);
  }
}

export class UnpadStream extends Transform {
  _onlyPaddingLeft: boolean;
  _maxChunkSize: number;
  _lastChunkSize: number;

  // sizeof int32 to hold nb padding bytes
  overhead = number.uint32ByteSize;

  constructor(maxChunkSize: number) {
    super({
      // buffering a single input chunk ('drain' can pull more)
      writableHighWaterMark: 1,
      writableObjectMode: true,
      // buffering a single output chunk
      readableHighWaterMark: 1,
      readableObjectMode: true,
    });

    this._onlyPaddingLeft = false;
    this._lastChunkSize = 0;
    this._maxChunkSize = maxChunkSize;
  }

  override _transform(paddedData: Uint8Array, _: BufferEncoding, done: TransformCallback) {
    if (this._lastChunkSize !== 0 && this._lastChunkSize !== this._maxChunkSize + this.overhead) {
      done(new InvalidArgument('Last chunk already processed'));
      return;
    }

    if (!(paddedData instanceof Uint8Array) || paddedData.length > this._maxChunkSize + this.overhead) {
      done(new InvalidArgument('paddedData', `Uint8Array[${this._maxChunkSize + this.overhead}]`, paddedData));
      return;
    }

    if (paddedData.length < this.overhead) {
      done(new InvalidArgument('truncated paddedData'));
      return;
    }

    const padding = number.fromUint32le(paddedData.slice(0, this.overhead));
    if (paddedData.length < this.overhead + padding) {
      done(new InvalidArgument('truncated paddedData'));
      return;
    }

    const clearData = paddedData.slice(this.overhead + padding);
    if (clearData.length !== 0 && this._onlyPaddingLeft) {
      done(new InvalidArgument('No data allowed after padding'));
      return;
    }

    this._lastChunkSize = paddedData.length;
    if (padding !== 0) {
      this._onlyPaddingLeft = true;
    }

    if (clearData.length) {
      this.push(clearData);
    }

    done();
  }

  override _flush(done: TransformCallback): void {
    done();
  }
}
