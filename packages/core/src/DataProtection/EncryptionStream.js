// @flow
import { utils, encryptionV4, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import { ResizerStream, Transform } from '@tanker/stream-base';
import type { DoneCallback } from '@tanker/stream-base';

export class EncryptionStream extends Transform {
  _maxClearChunkSize: number;
  _maxEncryptedChunkSize: number;
  _encryptionStream: Transform;
  _key: Uint8Array;
  _resizerStream: ResizerStream;
  _resourceId: Uint8Array;
  _state: {
    index: number,
    lastClearChunkSize: number,
  };

  constructor(resourceId: Uint8Array, key: Uint8Array, maxEncryptedChunkSize: number = encryptionV4.defaultMaxEncryptedChunkSize) {
    super({
      // buffering a single input chunk ('drain' can pull more)
      writableHighWaterMark: 1,
      writableObjectMode: true,
      // buffering a single output chunk
      readableHighWaterMark: 1,
      readableObjectMode: true,
    });

    this._maxClearChunkSize = maxEncryptedChunkSize - encryptionV4.overhead;
    this._maxEncryptedChunkSize = maxEncryptedChunkSize;
    this._resourceId = resourceId;
    this._key = key;
    this._state = {
      index: 0,
      lastClearChunkSize: 0,
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

      transform: (clearData, encoding, done) => {
        try {
          const encryptedChunk = this._encryptChunk(clearData);
          this._encryptionStream.push(encryptedChunk);
        } catch (err) {
          done(err);
          return;
        }
        done();
      },

      flush: (done) => {
        // flush a last empty block if remaining clear data is an exact multiple of max clear chunk size
        if (this._state.lastClearChunkSize % this._maxClearChunkSize === 0) {
          try {
            const encryptedChunk = this._encryptChunk(new Uint8Array(0));
            this._encryptionStream.push(encryptedChunk);
          } catch (err) {
            done(err);
            return;
          }
        }
        done();
      },
    });

    this._encryptionStream.on('data', (data) => this.push(data));
    [this._resizerStream, this._encryptionStream].forEach((stream) => stream.on('error', (error) => this.destroy(error)));
    this._resizerStream.pipe(this._encryptionStream);
  }

  _encryptChunk(clearChunk: Uint8Array) {
    const encryptedBuffer = encryptionV4.serialize(encryptionV4.encrypt(this._key, this._state.index, this._resourceId, this._maxEncryptedChunkSize, clearChunk));
    this._state.index += 1; // safe as long as index < 2^53
    this._state.lastClearChunkSize = clearChunk.length;

    return encryptedBuffer;
  }

  _transform(clearData: Uint8Array, encoding: ?string, done: DoneCallback) {
    if (!(clearData instanceof Uint8Array)) {
      done(new InvalidArgument('clearData', 'Uint8Array', clearData));
      return;
    }

    this._resizerStream.write(clearData, encoding, done);
  }

  _flush(done: DoneCallback) {
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

  getEncryptedSize = (clearSize: number): number => encryptionV4.getEncryptedSize(clearSize, this._maxEncryptedChunkSize);
}
