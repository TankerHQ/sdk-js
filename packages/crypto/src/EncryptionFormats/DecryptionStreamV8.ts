import { DecryptionFailed, InvalidArgument } from '@tanker/errors';
import { ResizerStream, Transform } from '@tanker/stream-base';
import type { TransformCallback, WriteCallback } from '@tanker/stream-base';

import type { KeyMapper } from './KeyMapper';
import { removePadding } from '../padding';
import type { ChunkHeader } from './v8';
import { EncryptionV8 } from './v8';
import * as utils from '../utils';

const checkHeaderIntegrity = (oldHeader: ChunkHeader, currentHeader: ChunkHeader) => {
  if (!utils.equalArray(oldHeader.resourceId, currentHeader.resourceId)) {
    throw new DecryptionFailed(
      { message: `resourceId mismatch in headers: expected ${oldHeader.resourceId}, got ${currentHeader.resourceId}` },
    );
  }
  if (oldHeader.encryptedChunkSize !== currentHeader.encryptedChunkSize) {
    throw new DecryptionFailed(
      { message: `encryptedChunkSize mismatch in headers: expected ${oldHeader.encryptedChunkSize}, got ${currentHeader.encryptedChunkSize}` },
    );
  }
};

export class DecryptionStreamV8 extends Transform {
  _mapper: KeyMapper;

  _state: {
    initialized: boolean;
    index: number;
    maxEncryptedChunkSize: number;
    lastEncryptedChunkSize: number;
    onlyPaddingLeft: boolean;
  };

  _resizerStream!: ResizerStream;
  _decryptionStream!: Transform;

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
      onlyPaddingLeft: false,
    };
  }

  encryptedChunkSize(): number {
    return this._state.maxEncryptedChunkSize;
  }

  async _initializeStreams(headOfEncryptedData: Uint8Array) {
    let encryptedChunkSize: number;
    let resourceId: Uint8Array;

    try {
      ({ encryptedChunkSize, resourceId } = EncryptionV8.unserialize(headOfEncryptedData));
    } catch (e) {
      throw new InvalidArgument('encryptedData is illformed for stream v8 decryption');
    }

    if (encryptedChunkSize < EncryptionV8.overhead + 1)
      throw new DecryptionFailed({ message: `invalid encrypted chunk size in header v8: ${encryptedChunkSize}` });

    const key = await this._mapper(resourceId);

    this._state.maxEncryptedChunkSize = encryptedChunkSize;
    this._resizerStream = new ResizerStream(encryptedChunkSize);

    const b64ResourceId = utils.toBase64(resourceId);

    this._decryptionStream = new Transform({
      // buffering input bytes until encrypted chunk size is reached
      writableHighWaterMark: encryptedChunkSize,
      writableObjectMode: false,
      // buffering output bytes until clear chunk size is reached
      readableHighWaterMark: encryptedChunkSize - EncryptionV8.overhead,
      readableObjectMode: false,

      transform: (encryptedChunk: Uint8Array, _: BufferEncoding, done: TransformCallback) => {
        try {
          const currentChunk = EncryptionV8.unserialize(encryptedChunk);
          checkHeaderIntegrity({ encryptedChunkSize, resourceId }, currentChunk);
          const clearPaddedData = EncryptionV8.decryptChunk(key, this._state.index, currentChunk);
          const clearData = removePadding(clearPaddedData);
          if (this._state.onlyPaddingLeft) {
            if (clearData.length !== 0) {
              throw new DecryptionFailed({ message: 'unable to remove padding', b64ResourceId });
            }
          } else if (clearData.length < clearPaddedData.length - 1) {
            this._state.onlyPaddingLeft = true;
          }
          this._decryptionStream.push(clearData);
        } catch (error) {
          done(new DecryptionFailed({ error: error as Error, b64ResourceId }));
          return;
        }

        this._state.lastEncryptedChunkSize = encryptedChunk.length;
        this._state.index += 1; // safe as long as index < 2^53

        done();
      },

      flush: (done: TransformCallback) => {
        if (this._state.lastEncryptedChunkSize % this._state.maxEncryptedChunkSize === 0) {
          done(new DecryptionFailed({
            message: 'Data has been truncated',
            b64ResourceId,
          }));
          return;
        }

        done();
      },
    });

    this._bindStreams();

    this._state.initialized = true;
    this.emit('initialized');
  }

  _bindStreams() {
    this._decryptionStream.on('data', data => this.push(data));
    [this._resizerStream, this._decryptionStream].forEach(stream => stream.on('error', error => this.destroy(error)));

    this._resizerStream.pipe(this._decryptionStream);
  }

  override async _transform(encryptedData: Uint8Array, encoding: BufferEncoding, done: TransformCallback) {
    if (!(encryptedData instanceof Uint8Array)) {
      done(new InvalidArgument('encryptedData', 'Uint8Array', encryptedData));
      return;
    }

    if (!this._state.initialized) {
      try {
        await this._initializeStreams(encryptedData);
      } catch (err) {
        done(err as Error);
        return;
      }
    }

    this._resizerStream.write(encryptedData, encoding, done as WriteCallback);
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
