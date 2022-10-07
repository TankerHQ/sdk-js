import { DecryptionFailed, InvalidArgument } from '@tanker/errors';
import { ResizerStream, Transform } from '@tanker/stream-base';
import type { TransformCallback, WriteCallback } from '@tanker/stream-base';

import type { KeyMapper } from './KeyMapper';
import * as utils from '../utils';
import { extractEncryptionFormat, SimpleEncryptor } from './EncryptionFormats';

export class DecryptionStreamSimple extends Transform {
  _mapper: KeyMapper;

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
          const encryption = extractEncryptionFormat(encryptedChunk) as SimpleEncryptor;
          const resourceId = encryption.extractResourceId(encryptedChunk);

          const key = await this._mapper(resourceId);

          try {
            const clearData = await encryption.decrypt(() => key, encryption.unserialize(encryptedChunk));
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

    this._decryptionStream.on('data', data => this.push(data));
    [this._resizerStream, this._decryptionStream].forEach(stream => stream.on('error', error => this.destroy(error)));

    this._resizerStream.pipe(this._decryptionStream);
  }

  override async _transform(encryptedData: Uint8Array, encoding: BufferEncoding, done: TransformCallback) {
    if (!(encryptedData instanceof Uint8Array)) {
      done(new InvalidArgument('encryptedData', 'Uint8Array', encryptedData));
      return;
    }

    this._resizerStream.write(encryptedData, encoding, done as WriteCallback);
  }

  override _flush(done: TransformCallback) {
    this._decryptionStream.once('end', done);
    this._resizerStream.end();
  }
}
