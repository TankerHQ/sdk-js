// @flow
import { encryptionV4, type Key } from '@tanker/crypto';
import { ResizerStream, Transform } from '@tanker/stream-base';

import { InvalidArgument, DecryptionFailed } from '../errors';

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
      headerRead: false,
      index: 0,
      lastEncryptedChunkSize: 0,
    };
  }

  async _extractHeader(encryptedData: Uint8Array): Promise<{ header: encryptionV4.EncryptionData, key: Uint8Array }> {
    let header;
    try {
      header = encryptionV4.unserialize(encryptedData);
    } catch (e) {
      throw new InvalidArgument('encryptedData', e, encryptedData);
    }
    const key = await this._mapper.findKey(header.resourceId);
    return { header, key };
  }

  async _configureStreams(headOfEncryptedData: Uint8Array) {
    const { key, header } = await this._extractHeader(headOfEncryptedData);
    this._state.headerRead = true;

    const { encryptedChunkSize, resourceId } = header;

    this._resizerStream = new ResizerStream(encryptedChunkSize);

    this._decryptionStream = new Transform({
      // buffering input bytes until encrypted chunk size is reached
      writableHighWaterMark: encryptedChunkSize,
      writableObjectMode: false,
      // buffering output bytes until clear chunk size is reached
      readableHighWaterMark: encryptedChunkSize - encryptionV4.overhead,
      readableObjectMode: false,

      transform: (encryptedChunk, encoding, done) => {
        try {
          const clearData = encryptionV4.decrypt(key, this._state.index, encryptionV4.unserialize(encryptedChunk));
          this._decryptionStream.push(clearData);
        } catch (error) {
          return done(new DecryptionFailed({ error, resourceId }));
        }
        this._state.lastEncryptedChunkSize = encryptedChunk.length;
        this._state.index += 1; // safe as long as index < 2^53

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
