// @flow

import varint from 'varint';

import { utils, tcrypto, aead, type b64string } from '@tanker/crypto';
import { ResizerStream, Transform } from '@tanker/stream-base';

import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { concatArrays } from '../Blocks/Serialize';
import { InvalidArgument } from '../errors';
import { encryptorStreamVersion, defaultEncryptionSize } from './StreamConfigs';

export default class EncryptorStream extends Transform {
  _encryptionSize: number;

  _state: {
    resourceIdKeyPair: ResourceIdKeyPair,
    index: number
  }

  _resizerStream: ResizerStream;
  _encryptorStream: Transform;

  constructor(resourceId: Uint8Array, key: Uint8Array, encryptionSize: number = defaultEncryptionSize) {
    super({ objectMode: true });

    this._encryptionSize = encryptionSize;
    this._state = {
      resourceIdKeyPair: {
        key,
        resourceId
      },
      index: 0
    };

    this._configureStreams();

    this._writeHeader();
  }

  _configureStreams() {
    this._resizerStream = new ResizerStream(this._encryptionSize);

    const derive = this._deriveKey.bind(this);
    this._encryptorStream = new Transform({
      writableHighWaterMark: this._encryptionSize,
      readableHighWaterMark: this._encryptionSize + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD,
      transform: async function transform(clearData, encoding, done) {
        const subKey = derive();
        try {
          const eData = await aead.encryptAEADv2(subKey, clearData);
          this.push(eData);
        } catch (err) {
          return done(err);
        }
        done();
      }
    });

    const forwardData = (data) => this.push(data);
    this._encryptorStream.on('data', forwardData);
    const forwardError = (error) => this.emit('error', error);
    [this._resizerStream, this._encryptorStream].forEach((stream) => stream.on('error', forwardError));

    this._resizerStream.pipe(this._encryptorStream);
  }

  _deriveKey() {
    const subKey = tcrypto.deriveKey(this._state.resourceIdKeyPair.key, this._state.index);
    this._state.index += 1;
    return subKey;
  }

  _writeHeader() {
    const header = concatArrays(varint.encode(encryptorStreamVersion), this._state.resourceIdKeyPair.resourceId);
    this._encryptorStream.push(header);
  }

  resourceId(): b64string {
    return utils.toBase64(this._state.resourceIdKeyPair.resourceId);
  }

  _transform(clearData, encoding, done) {
    if (!(clearData instanceof Uint8Array)) {
      done(new InvalidArgument('clearData', 'Uint8Array', clearData));
    } else {
      this._resizerStream.write(clearData, encoding, done);
    }
  }

  _flush(done) {
    this._encryptorStream.on('end', done);
    this._resizerStream.end();
  }
}
