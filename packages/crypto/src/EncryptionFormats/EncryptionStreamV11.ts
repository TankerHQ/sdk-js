import { InvalidArgument } from '@tanker/errors';
import { ResizerStream, Transform } from '@tanker/stream-base';
import type { TransformCallback, WriteCallback } from '@tanker/stream-base';

import type { b64string } from '../aliases';
import * as utils from '../utils';
import * as tcrypto from '../tcrypto';
import { EncryptionV11 } from './TransparentEncryption';
import type { StreamHeaderData } from './TransparentEncryption';
import type { Padding } from '../padding';
import { PadStream } from '../PaddingStream';
import { serializeCompositeResourceId } from '../resourceId';
import { random } from '../random';

export class EncryptionStreamV11 extends Transform {
  _maxClearChunkSize: number;
  _encryptionStream!: Transform;
  _key: Uint8Array;
  _resizerStream!: ResizerStream;
  _paddingStream!: PadStream;
  _state: {
    index: number;
    lastClearChunkSize: number;
  };

  _header: StreamHeaderData;

  constructor(sessionId: Uint8Array, key: Uint8Array, paddingStep?: number | Padding, maxEncryptedChunkSize = EncryptionV11.defaultMaxEncryptedChunkSize) {
    super({
      // buffering a single input chunk ('drain' can pull more)
      writableHighWaterMark: 1,
      writableObjectMode: true,
      // buffering a single output chunk
      readableHighWaterMark: 1,
      readableObjectMode: true,
    });

    if (sessionId.length > tcrypto.SESSION_ID_SIZE) {
      throw new InvalidArgument('sessionId', `Uint8Array[${tcrypto.SESSION_ID_SIZE}]`, sessionId);
    }

    const seed: Uint8Array = random(tcrypto.SESSION_SEED_SIZE);
    this._header = {
      sessionId,
      resourceId: seed,
      encryptedChunkSize: maxEncryptedChunkSize,
    };

    this._maxClearChunkSize = this._header.encryptedChunkSize - EncryptionV11.chunkOverhead;
    this._key = EncryptionV11.deriveSessionKey(key, seed);
    this._state = {
      index: 0,
      lastClearChunkSize: 0,
    };

    this._initializeStreams(paddingStep);
  }

  _initializeStreams(paddingStep?: number | Padding) {
    this._resizerStream = new ResizerStream(this._maxClearChunkSize);
    this._paddingStream = new PadStream(this._maxClearChunkSize, paddingStep);

    this._encryptionStream = new Transform({
      // buffering input bytes until clear chunk size is reached
      writableHighWaterMark: this._paddingStream.paddedChunkSize(),
      writableObjectMode: false,
      // buffering output bytes until encrypted chunk size is reached
      readableHighWaterMark: this._header.encryptedChunkSize,
      readableObjectMode: false,

      transform: (clearData: Uint8Array, _: BufferEncoding, done: TransformCallback) => {
        try {
          const encryptedChunk = this._encryptChunk(clearData);
          this._encryptionStream.push(encryptedChunk);
        } catch (err) {
          done(err as Error);
          return;
        }

        done();
      },

      flush: (done: TransformCallback) => {
        // flush a last empty block if remaining clear data is an exact multiple of max clear chunk size
        if (this._state.lastClearChunkSize % this._paddingStream.paddedChunkSize() === 0) {
          try {
            const encryptedChunk = this._encryptChunk(this._paddingStream.emptyChunk());
            this._encryptionStream.push(encryptedChunk);
          } catch (err) {
            done(err as Error);
            return;
          }
        }

        done();
      },
    });

    const streams: Array<Transform> = [
      this._resizerStream,
      this._paddingStream,
      this._encryptionStream,
    ];

    this._encryptionStream.on('data', data => this.push(data));
    streams.forEach(stream => stream.on('error', error => this.destroy(error)));
    streams.reduce((previousStream, currentStream) => previousStream.pipe(currentStream));

    // push stream header first
    this.push(EncryptionV11.serializeHeader(this._header));
  }

  _encryptChunk(clearChunk: Uint8Array) {
    const encryptedBuffer = EncryptionV11.encryptChunk(this._key, this._state.index, this._header, clearChunk);
    this._state.index += 1; // safe as long as index < 2^53
    this._state.lastClearChunkSize = clearChunk.length;

    return encryptedBuffer;
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
    return this._header.encryptedChunkSize;
  }

  get resourceId(): b64string {
    return utils.toBase64(serializeCompositeResourceId(this._header));
  }

  getEncryptedSize = (clearSize: number): number => EncryptionV11.getEncryptedSize(clearSize, this._header.encryptedChunkSize);
}
