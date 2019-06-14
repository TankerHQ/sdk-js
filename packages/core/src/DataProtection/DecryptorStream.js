// @flow
import { aead, tcrypto, type Key } from '@tanker/crypto';
import { ResizerStream, Transform } from '@tanker/stream-base';

import { InvalidArgument, DecryptionFailed } from '../errors';
import { extractHeaderV4, type HeaderV4 } from '../Resource/ResourceManager';

export type ResourceIdKeyMapper = {
  findKey: (Uint8Array) => Promise<Key>
};

export default class DecryptorStream extends Transform {
  _mapper: ResourceIdKeyMapper;

  _state: {
    headerRead: bool,
    index: number,
    lastEncryptedChunkSize: number,
  };

  _resizerStream: ResizerStream;
  _decryptionStream: Transform;

  constructor(mapper: ResourceIdKeyMapper) {
    super({ objectMode: true });

    this._mapper = mapper;

    this._state = {
      headerRead: false,
      index: 0,
      lastEncryptedChunkSize: 0,
    };
  }

  async _extractHeader(encryptedData: Uint8Array): Promise<{ header: HeaderV4, data: Uint8Array, key: Uint8Array }> {
    const { data, header } = extractHeaderV4(encryptedData);
    const key = await this._mapper.findKey(header.resourceId);
    return { data, header, key };
  }

  async _configureStreams(headOfEncryptedData: Uint8Array) {
    const { key, header } = await this._extractHeader(headOfEncryptedData);
    this._state.headerRead = true;

    const { byteLength: headerLength, encryptedChunkSize, resourceId } = header;

    const overheadPerChunk = headerLength + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD;

    this._resizerStream = new ResizerStream(encryptedChunkSize);

    this._decryptionStream = new Transform({
      writableHighWaterMark: encryptedChunkSize,
      readableHighWaterMark: encryptedChunkSize - overheadPerChunk,

      transform: (encryptedChunk, encoding, done) => {
        const encryptedData = encryptedChunk.subarray(headerLength + tcrypto.XCHACHA_IV_SIZE);
        const ivSeed = encryptedChunk.subarray(headerLength, headerLength + tcrypto.XCHACHA_IV_SIZE);
        const iv = tcrypto.deriveIV(ivSeed, this._state.index);

        this._state.index += 1; // safe as long as index < 2^53
        this._state.lastEncryptedChunkSize = encryptedChunk.length;

        try {
          const clearData = aead.decryptAEAD(key, iv, encryptedData);
          this._decryptionStream.push(clearData);
        } catch (error) {
          return done(new DecryptionFailed({ error, resourceId }));
        }

        done();
      },

      flush: (done) => {
        if (this._state.lastEncryptedChunkSize % encryptedChunkSize === 0) {
          done(new DecryptionFailed({ message: 'Data has been truncated', resourceId }));
          return;
        }

        done();
      },
    });

    const forwardData = (data) => this.push(data);
    this._decryptionStream.on('data', forwardData);
    const forwardError = (error) => this.emit('error', error);
    [this._resizerStream, this._decryptionStream].forEach((stream) => stream.on('error', forwardError));

    this._resizerStream.pipe(this._decryptionStream);
  }

  async _transform(encryptedData: Uint8Array, encoding: ?string, done: Function) {
    if (!(encryptedData instanceof Uint8Array))
      return done(new InvalidArgument('encryptedData', 'Uint8Array', encryptedData));

    if (!this._state.headerRead) {
      try {
        await this._configureStreams(encryptedData);
      } catch (err) {
        return done(err);
      }
    }

    this._resizerStream.write(encryptedData, done);
  }

  _flush(done: Function) {
    // When end() is called before any data has been written:
    if (!this._state.headerRead) {
      done();
      return;
    }

    this._decryptionStream.on('end', done);
    this._resizerStream.end();
  }
}
