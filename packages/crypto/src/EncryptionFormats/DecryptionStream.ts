import { DecryptionFailed, InternalError, InvalidArgument } from '@tanker/errors';
import { Transform } from '@tanker/stream-base';
import type { TransformCallback, WriteCallback } from '@tanker/stream-base';

import type { Key } from '../aliases';
import { extractEncryptionFormat } from './EncryptionFormats';
import { DecryptionStreamSimple } from './DecryptionStreamSimple';
import { DecryptionStreamV4 } from './DecryptionStreamV4';
import { DecryptionStreamV8 } from './DecryptionStreamV8';

export type ResourceIdKeyMapper = {
  findKey: (resourceID: Uint8Array) => Promise<Key>;
};

export class DecryptionStream extends Transform {
  _mapper: ResourceIdKeyMapper;

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
  }

  encryptedChunkSize(): number {
    if (this._decryptionStream instanceof DecryptionStreamV4 || this._decryptionStream instanceof DecryptionStreamV8)
      return this._decryptionStream.encryptedChunkSize();
    throw new InternalError('Assertion error: trying to get encrypted chunk size on simple encryption');
  }

  async _initializeStreams(headOfEncryptedData: Uint8Array) {
    const encryption = extractEncryptionFormat(headOfEncryptedData);

    if (encryption.version === 4) {
      this._decryptionStream = new DecryptionStreamV4(this._mapper);
    } else if (encryption.version === 8) {
      this._decryptionStream = new DecryptionStreamV8(this._mapper);
    } else {
      this._decryptionStream = new DecryptionStreamSimple(this._mapper);
    }

    this._decryptionStream.on('data', data => this.push(data));
    this._decryptionStream.on('error', error => this.destroy(error));
    this._decryptionStream.on('initialized', () => this.emit('initialized'));
  }

  override async _transform(encryptedData: Uint8Array, encoding: BufferEncoding, done: TransformCallback) {
    if (!(encryptedData instanceof Uint8Array)) {
      done(new InvalidArgument('encryptedData', 'Uint8Array', encryptedData));
      return;
    }

    if (!this._decryptionStream) {
      try {
        await this._initializeStreams(encryptedData);
      } catch (err) {
        done(err as Error);
        return;
      }
    }

    this._decryptionStream.write(encryptedData, encoding, done as WriteCallback);
  }

  override _flush(done: TransformCallback) {
    // When end() is called before any data has been written:
    if (!this._decryptionStream) {
      done(new DecryptionFailed({ message: 'Data has been truncated' }));
      return;
    }

    this._decryptionStream.once('end', done);
    this._decryptionStream.end();
  }
}
