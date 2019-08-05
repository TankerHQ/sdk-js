// @flow
import { aead, random, tcrypto, utils, type b64string } from '@tanker/crypto';
import { ResizerStream, Transform } from '@tanker/stream-base';

import { currentStreamVersion, serializeHeaderV4, type HeaderV4 } from './Resource/ResourceManager';
import { InvalidArgument } from '../errors';

export const defaultEncryptedChunkSize = 1024 * 1024; // 1MB

export default class EncryptorStream extends Transform {
  _clearChunkSize: number;
  _encryptedChunkSize: number;
  _encryptorStream: Transform;
  _key: Uint8Array;
  _header: HeaderV4;
  _overheadPerChunk: number;
  _resizerStream: ResizerStream;
  _serializedHeader: Uint8Array;
  _state: {
    index: number,
    lastClearChunkSize: number,
  }

  constructor(resourceId: Uint8Array, key: Uint8Array, encryptedChunkSize: number = defaultEncryptedChunkSize) {
    const header = {
      version: currentStreamVersion,
      encryptedChunkSize,
      resourceId,
    };

    const serializedHeader = serializeHeaderV4(header);

    const overheadPerChunk = serializedHeader.length + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD;

    const clearChunkSize = encryptedChunkSize - overheadPerChunk;

    super({
      // buffering a single input chunk ('drain' can pull more)
      writableHighWaterMark: 1,
      writableObjectMode: true,
      // buffering a single output chunk
      readableHighWaterMark: 1,
      readableObjectMode: true,
    });

    this._clearChunkSize = clearChunkSize;
    this._encryptedChunkSize = encryptedChunkSize;
    this._header = header;
    this._key = key;
    this._overheadPerChunk = overheadPerChunk;
    this._serializedHeader = serializedHeader;
    this._state = {
      index: 0,
      lastClearChunkSize: 0,
    };

    this._configureStreams();
  }

  _configureStreams() {
    this._resizerStream = new ResizerStream(this._clearChunkSize);

    this._encryptorStream = new Transform({
      // buffering input bytes until clear chunk size is reached
      writableHighWaterMark: this._clearChunkSize,
      writableObjectMode: false,
      // buffering output bytes until encrypted chunk size is reached
      readableHighWaterMark: this._encryptedChunkSize,
      readableObjectMode: false,

      transform: (clearData, encoding, done) => {
        try {
          const encryptedChunk = this._encryptChunk(clearData);
          this._encryptorStream.push(encryptedChunk);
        } catch (err) {
          return done(err);
        }
        done();
      },

      flush: (done) => {
        // flush a last empty block if remaining clear data is an exact multiple of max clear chunk size
        if (this._state.lastClearChunkSize % this._clearChunkSize === 0) {
          try {
            const encryptedChunk = this._encryptChunk(new Uint8Array(0));
            this._encryptorStream.push(encryptedChunk);
          } catch (err) {
            return done(err);
          }
        }
        done();
      },
    });

    const forwardData = (data) => this.push(data);
    this._encryptorStream.on('data', forwardData);
    const forwardError = (error) => this.emit('error', error);
    [this._resizerStream, this._encryptorStream].forEach((stream) => stream.on('error', forwardError));

    this._resizerStream.pipe(this._encryptorStream);
  }

  _encryptChunk(clearChunk: Uint8Array) {
    const ivSeed = random(tcrypto.XCHACHA_IV_SIZE);
    const iv = tcrypto.deriveIV(ivSeed, this._state.index);

    this._state.index += 1; // safe as long as index < 2^53
    this._state.lastClearChunkSize = clearChunk.length;

    const encryptedData = aead.encryptAEAD(this._key, iv, clearChunk);
    return utils.concatArrays(this._serializedHeader, ivSeed, encryptedData);
  }

  _transform(clearData: Uint8Array, encoding: ?string, done: Function) {
    if (!(clearData instanceof Uint8Array)) {
      done(new InvalidArgument('clearData', 'Uint8Array', clearData));
    } else {
      this._resizerStream.write(clearData, encoding, done);
    }
  }

  _flush(done: Function) {
    this._encryptorStream.on('end', done);
    this._resizerStream.end();
  }

  get clearChunkSize(): number {
    return this._clearChunkSize;
  }

  get encryptedChunkSize(): number {
    return this._encryptedChunkSize;
  }

  get overheadPerChunk(): number {
    return this._overheadPerChunk;
  }

  get resourceId(): b64string {
    return utils.toBase64(this._header.resourceId);
  }
}
