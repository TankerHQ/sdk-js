import type { Key } from '@tanker/crypto';
import { encryptionV4, utils } from '@tanker/crypto';
import { DecryptionFailed, InvalidArgument } from '@tanker/errors';
import { ResizerStream, Transform } from '@tanker/stream-base';
import type { TransformCallback, WriteCallback } from '@tanker/stream-base';

import { extractEncryptionFormat } from './types';

export type ResourceIdKeyMapper = {
  findKey: (resourceID: Uint8Array) => Promise<Key>;
};

type ChunkHeader = Pick<encryptionV4.EncryptionData, 'resourceId' | 'encryptedChunkSize'>;

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

export class DecryptionStream extends Transform {
  _mapper: ResourceIdKeyMapper;

  _state: {
    initialized: boolean;
    index: number;
    maxEncryptedChunkSize: number;
    lastEncryptedChunkSize: number;
  };

  _resizerStream!: ResizerStream;
  _decryptionStream!: Transform;

  constructor(mapper: ResourceIdKeyMapper) {
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
    const encryption = extractEncryptionFormat(headOfEncryptedData);

    if (encryption.features.chunks) {
      await this._initializeStreamDecryption(headOfEncryptedData);
    } else {
      await this._initializeSimpleDecryption();
    }

    this._bindStreams();

    this._state.initialized = true;
    this.emit('initialized');
  }

  _bindStreams() {
    this._decryptionStream.on('data', data => this.push(data));
    [this._resizerStream, this._decryptionStream].forEach(stream => stream.on('error', error => this.destroy(error)));

    this._resizerStream.pipe(this._decryptionStream);
  }

  async _initializeSimpleDecryption() {
    // buffering input bytes until every byte is received
    this._resizerStream = new ResizerStream(Number.MAX_SAFE_INTEGER);

    this._decryptionStream = new Transform({
      writableHighWaterMark: 1,
      writableObjectMode: true,
      readableHighWaterMark: 1,
      readableObjectMode: true,

      // transform will only be called once when every data has been received
      transform: async (encryptedChunk: Uint8Array, _: BufferEncoding, done: TransformCallback) => {
        try {
          const encryption = extractEncryptionFormat(encryptedChunk);
          const resourceId = encryption.extractResourceId(encryptedChunk);

          const key = await this._mapper.findKey(resourceId);

          try {
            // @ts-expect-error Already checked we are using a simple encryption
            const clearData = encryption.decrypt(key, encryption.unserialize(encryptedChunk));
            this._decryptionStream.push(clearData);
          } catch (error) {
            const b64ResourceId = utils.toBase64(resourceId);
            done(new DecryptionFailed({ error: error as Error, b64ResourceId }));
            return;
          }
        } catch (error) {
          done(error as Error);
          return;
        }

        done();
      },
    });
  }

  async _initializeStreamDecryption(headOfEncryptedData: Uint8Array) {
    let encryptedChunkSize: number;
    let resourceId: Uint8Array;

    try {
      ({ encryptedChunkSize, resourceId } = encryptionV4.unserialize(headOfEncryptedData));
    } catch (e) {
      throw new InvalidArgument('encryptedData is illformed for stream decryption');
    }

    const key = await this._mapper.findKey(resourceId);

    this._state.maxEncryptedChunkSize = encryptedChunkSize;
    this._resizerStream = new ResizerStream(encryptedChunkSize);

    const b64ResourceId = utils.toBase64(resourceId);

    this._decryptionStream = new Transform({
      // buffering input bytes until encrypted chunk size is reached
      writableHighWaterMark: encryptedChunkSize,
      writableObjectMode: false,
      // buffering output bytes until clear chunk size is reached
      readableHighWaterMark: encryptedChunkSize - encryptionV4.overhead,
      readableObjectMode: false,

      transform: (encryptedChunk: Uint8Array, _: BufferEncoding, done: TransformCallback) => {
        try {
          const currentChunk = encryptionV4.unserialize(encryptedChunk);
          checkHeaderIntegrity({ encryptedChunkSize, resourceId }, currentChunk);
          const clearData = encryptionV4.decrypt(key, this._state.index, currentChunk);
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
      done();
      return;
    }

    this._decryptionStream.once('end', done);
    this._resizerStream.end();
  }
}
