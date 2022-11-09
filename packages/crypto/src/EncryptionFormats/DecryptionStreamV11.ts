import { DecryptionFailed, InvalidArgument } from '@tanker/errors';
import { ResizerStream, Transform } from '@tanker/stream-base';
import type { TransformCallback, WriteCallback } from '@tanker/stream-base';

import type { KeyMapper } from './KeyMapper';
import type { StreamHeaderData } from './TransparentEncryption';
import { EncryptionV11 } from './TransparentEncryption';
import * as utils from '../utils';
import { serializeCompositeResourceId, getKeyFromResourceId } from '../resourceId';
import { UnpadStream } from '../PaddingStream';

export class DecryptionStreamV11 extends Transform {
  _mapper: KeyMapper;

  _state: {
    initialized: boolean;
    index: number;
    maxEncryptedChunkSize: number;
    lastEncryptedChunkSize: number;
  };

  _resizerStream!: ResizerStream;
  _decryptionStream!: Transform;
  _header!: StreamHeaderData;

  constructor(mapper: KeyMapper) {
    super({
      // buffering a single input chunk ('drain' can pull more)
      writableHighWaterMark: 1,
      writableObjectMode: true,
      // buffering a single output chunk
      readableHighWaterMark: 1,
      readableObjectMode: true,
    });

    this._mapper = mapper;

    this._state = {
      initialized: false,
      index: 0,
      maxEncryptedChunkSize: 0,
      lastEncryptedChunkSize: 0,
    };
  }

  encryptedChunkSize(): number {
    return this._state.maxEncryptedChunkSize;
  }

  async _initializeStreams(headOfEncryptedData: Uint8Array) {
    try {
      this._header = EncryptionV11.unserializeHeader(headOfEncryptedData);
    } catch (e) {
      throw new InvalidArgument(`encryptedData is illformed for stream v${EncryptionV11.version} decryption`);
    }

    if (this._header.encryptedChunkSize < EncryptionV11.chunkOverhead + 1)
      throw new DecryptionFailed({ message: `invalid encrypted chunk size in header v${EncryptionV11.version}: ${this._header.encryptedChunkSize}` });

    this._state.maxEncryptedChunkSize = this._header.encryptedChunkSize;
    this._resizerStream = new ResizerStream(this._header.encryptedChunkSize);

    const b64ResourceId = utils.toBase64(serializeCompositeResourceId(this._header));
    const { key } = await getKeyFromResourceId(b64ResourceId, this._mapper);

    this._decryptionStream = new Transform({
      // buffering input bytes until encrypted chunk size is reached
      writableHighWaterMark: this._header.encryptedChunkSize,
      writableObjectMode: false,
      // buffering output bytes until clear chunk size is reached
      readableHighWaterMark: this._header.encryptedChunkSize - EncryptionV11.chunkOverhead,
      readableObjectMode: false,

      transform: (encryptedChunk: Uint8Array, _: BufferEncoding, done: TransformCallback) => {
        try {
          const clearData = EncryptionV11.decryptChunk(key, this._state.index, this._header, encryptedChunk);
          this._decryptionStream.push(clearData);
        } catch (error) {
          done(error as Error);
          return;
        }

        this._state.lastEncryptedChunkSize = encryptedChunk.length;
        this._state.index += 1; // safe as long as index < 2^53

        done();
      },

      flush: (done: TransformCallback) => {
        done();
      },
    });

    this._bindStreams();

    this._state.initialized = true;
    this.emit('initialized');
  }

  _bindStreams() {
    const unpadStream = new UnpadStream(this._header.encryptedChunkSize - EncryptionV11.chunkOverhead);
    const streams = [this._resizerStream, this._decryptionStream, unpadStream];

    unpadStream.on('data', data => this.push(data));
    streams.forEach(stream => stream.on('error', error => this.destroy(error)));
    streams.reduce((previousStream, currentStream) => previousStream.pipe(currentStream));
  }

  override async _transform(encryptedData: Uint8Array, encoding: BufferEncoding, done: TransformCallback) {
    if (!(encryptedData instanceof Uint8Array)) {
      done(new InvalidArgument('encryptedData', 'Uint8Array', encryptedData));
      return;
    }

    let data = encryptedData;
    if (!this._state.initialized) {
      try {
        await this._initializeStreams(encryptedData);
        data = encryptedData.slice(EncryptionV11.overhead);
      } catch (err) {
        done(err as Error);
        return;
      }
    }

    this._resizerStream.write(data, encoding, done as WriteCallback);
  }

  override _flush(done: TransformCallback) {
    // When end() is called before any data has been written:
    if (!this._state.initialized) {
      done(new DecryptionFailed({ message: 'Data has been truncated' }));
      return;
    }

    this._decryptionStream.once('end', done);
    this._resizerStream.end();
  }
}
