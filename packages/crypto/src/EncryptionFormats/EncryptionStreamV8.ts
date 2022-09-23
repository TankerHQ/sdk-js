import { InvalidArgument } from '@tanker/errors';
import { ResizerStream, Transform } from '@tanker/stream-base';
import type { TransformCallback, WriteCallback } from '@tanker/stream-base';

import type { b64string } from '../aliases';
import * as utils from '../utils';
import type { Padding } from '../padding';
import { paddedFromClearSize } from '../padding';
import { EncryptionV8 } from './v8';

export class EncryptionStreamV8 extends Transform {
  _maxClearChunkSize: number;
  _maxEncryptedChunkSize: number;
  _encryptionStream!: Transform;
  _key: Uint8Array;
  _resizerStream!: ResizerStream;
  _resourceId: Uint8Array;
  _paddingStep: undefined | number | Padding;
  _state: {
    index: number;
    lastClearChunkSize: number;
    bytesProcessed: number;
    paddingLeft: null | number;
  };

  constructor(resourceId: Uint8Array, key: Uint8Array, paddingStep?: undefined | number | Padding, maxEncryptedChunkSize: number = EncryptionV8.defaultMaxEncryptedChunkSize) {
    super({
      // buffering a single input chunk ('drain' can pull more)
      writableHighWaterMark: 1,
      writableObjectMode: true,
      // buffering a single output chunk
      readableHighWaterMark: 1,
      readableObjectMode: true,
    });

    this._maxClearChunkSize = maxEncryptedChunkSize - EncryptionV8.overhead;
    this._maxEncryptedChunkSize = maxEncryptedChunkSize;
    this._resourceId = resourceId;
    this._key = key;
    this._paddingStep = paddingStep;
    this._state = {
      index: 0,
      lastClearChunkSize: 0,
      bytesProcessed: 0,
      paddingLeft: null,
    };

    this._initializeStreams();
  }

  _initializeStreams() {
    this._resizerStream = new ResizerStream(this._maxClearChunkSize);

    this._encryptionStream = new Transform({
      // buffering input bytes until clear chunk size is reached
      writableHighWaterMark: this._maxClearChunkSize,
      writableObjectMode: false,
      // buffering output bytes until encrypted chunk size is reached
      readableHighWaterMark: this._maxEncryptedChunkSize,
      readableObjectMode: false,

      transform: (clearData: Uint8Array, _: BufferEncoding, done: TransformCallback) => {
        // create a buffer with the clear data, 0x80 and zeros after
        let paddedData = new Uint8Array(this._maxClearChunkSize + 1);
        paddedData.set(clearData, 0);
        paddedData[clearData.length] = 0x80;

        this._state.bytesProcessed += clearData.length;
        // if this is the last clear chunk
        if (clearData.length < this._maxClearChunkSize) {
          this._calculatePadding();

          const paddingForCurrentChunk = Math.min(this._maxClearChunkSize - clearData.length, this._state.paddingLeft!);
          // truncate the buffer
          paddedData = paddedData.subarray(0, clearData.length + 1 + paddingForCurrentChunk);
          this._state.paddingLeft! -= paddingForCurrentChunk;
        }

        try {
          this._encryptionStream.push(this._encryptChunk(paddedData));
        } catch (err) {
          done(err as Error);
          return;
        }

        done();
      },

      flush: (done: TransformCallback) => {
        if (this._state.paddingLeft === null) {
          this._calculatePadding();
        }

        if (this._state.paddingLeft) {
          let paddedData = new Uint8Array(this._maxClearChunkSize + 1);
          paddedData[0] = 0x80;
          while (this._state.paddingLeft) {
            const paddingForCurrentChunk = Math.min(this._maxClearChunkSize, this._state.paddingLeft);
            // truncate the buffer (will only actually truncate something on the last chunk)
            paddedData = paddedData.subarray(0, paddingForCurrentChunk + 1);
            this._state.paddingLeft -= paddingForCurrentChunk;

            this._encryptionStream.push(this._encryptChunk(paddedData));
          }
        }

        // flush a last empty block if remaining clear data is an exact multiple of max clear chunk size
        if (this._state.lastClearChunkSize % this._maxClearChunkSize === 0) {
          try {
            const encryptedChunk = this._encryptChunk(new Uint8Array([0x80]));
            this._encryptionStream.push(encryptedChunk);
          } catch (err) {
            done(err as Error);
            return;
          }
        }

        done();
      },
    });

    this._encryptionStream.on('data', data => this.push(data));
    [this._resizerStream, this._encryptionStream].forEach(stream => stream.on('error', error => this.destroy(error)));

    this._resizerStream.pipe(this._encryptionStream);
  }

  _encryptChunk(clearChunk: Uint8Array) {
    const encryptedBuffer = EncryptionV8.serialize(EncryptionV8.encryptChunk(this._key, this._state.index, this._resourceId, this._maxEncryptedChunkSize, clearChunk));
    this._state.index += 1; // safe as long as index < 2^53
    this._state.lastClearChunkSize = clearChunk.length - 1;

    return encryptedBuffer;
  }

  _calculatePadding() {
    this._state.paddingLeft = paddedFromClearSize(this._state.bytesProcessed, this._paddingStep) - 1 - this._state.bytesProcessed;
  }

  override _transform(clearData: Uint8Array, encoding: BufferEncoding, done: TransformCallback) {
    if (!(clearData instanceof Uint8Array)) {
      done(new InvalidArgument('clearData', 'Uint8Array', clearData));
      return;
    }

    this._resizerStream.write(clearData, encoding, done as WriteCallback);
  }

  override _flush(done: TransformCallback) {
    this._encryptionStream.once('end', done);
    this._resizerStream.end();
  }

  get clearChunkSize(): number {
    return this._maxClearChunkSize;
  }

  get encryptedChunkSize(): number {
    return this._maxEncryptedChunkSize;
  }

  get resourceId(): b64string {
    return utils.toBase64(this._resourceId);
  }

  getEncryptedSize = (clearSize: number): number => EncryptionV8.getEncryptedSize(clearSize, this._paddingStep, this._maxEncryptedChunkSize);
}
