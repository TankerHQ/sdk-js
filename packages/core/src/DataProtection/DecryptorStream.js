// @flow

import varint from 'varint';

import { aead, tcrypto } from '@tanker/crypto';
import { ResizerStream, Transform } from '@tanker/stream-base';

import { InvalidEncryptionFormat, InvalidArgument, NotEnoughData, DecryptFailed } from '../errors';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { defaultOutputSize, defaultDecryptionSize, type ResourceIdKeyMapper } from './StreamConfigs';

export default class DecryptorStream extends Transform {
  _mapper: ResourceIdKeyMapper;
  _outputSize: number = defaultOutputSize;
  _decryptionSize: number;

  _state: {
    resourceIdKeyPair: ?ResourceIdKeyPair,
    index: number
  };

  _resizerStream: ResizerStream;
  _decryptionStream: Transform;

  constructor(mapper: ResourceIdKeyMapper, decryptionSize: number = defaultDecryptionSize) {
    super({ objectMode: true });

    this._mapper = mapper;
    this._decryptionSize = decryptionSize;
    this._state = {
      resourceIdKeyPair: null,
      index: 0
    };

    this._configureStreams();
  }

  _configureStreams() {
    this._resizerStream = new ResizerStream(this._decryptionSize);

    const derive = this._deriveKey.bind(this);
    // $FlowIKnow _resourceKeyPair is always defined during write
    const resourceId = () => this._state.resourceIdKeyPair.resourceId;
    this._decryptionStream = new Transform({
      writableHighWaterMark: this._decryptionSize,
      readableHighWaterMark: this._decryptionSize - tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD,

      transform: async function transform(chunk, encoding, done) {
        let clearData;
        const subKey = derive();
        try {
          clearData = await aead.decryptAEADv2(subKey, chunk);
        } catch (error) {
          return done(new DecryptFailed(error, resourceId()));
        }
        this.push(clearData);
        done();
      }
    });

    const forwardData = (data) => this.push(data);
    this._decryptionStream.on('data', forwardData);
    const forwardError = (error) => this.emit('error', error);
    [this._resizerStream, this._decryptionStream].forEach((stream) => stream.on('error', forwardError));

    this._resizerStream.pipe(this._decryptionStream);
  }

  _deriveKey() {
    // $FlowIKnow _resourceKeyPair is always defined during write
    const subKey = tcrypto.deriveKey(this._state.resourceIdKeyPair.key, this._state.index);
    this._state.index += 1;
    return subKey;
  }

  _findHeaderSizeFromVersion(version: number) {
    switch (version) {
      case 1:
        return tcrypto.MAC_SIZE;
      default:
        throw new InvalidEncryptionFormat(`unhandled format version in DecryptorStream: '${version}'`);
    }
  }

  async _findResourceIdKeyPair(version: number, binaryData: Uint8Array) {
    switch (version) {
      case 1:
        return {
          key: await this._mapper.findKey(binaryData),
          resourceId: binaryData
        };
      default:
        throw new InvalidEncryptionFormat(`unhandled format version in DecryptorStream: '${version}'`);
    }
  }

  async _extractHeader(data: Uint8Array) {
    const version = varint.decode(data);
    const headerStart = varint.decode.bytes;
    const headerEnd = headerStart + this._findHeaderSizeFromVersion(version);

    if (data.length < headerEnd) {
      throw new NotEnoughData('First write must contain the complete header');
    }

    const rawHeader = data.subarray(headerStart, headerEnd);
    const remaining = data.subarray(headerEnd);
    return {
      header: await this._findResourceIdKeyPair(version, rawHeader),
      remaining
    };
  }

  async _transform(encryptedData, encoding, done) {
    if (!(encryptedData instanceof Uint8Array))
      return done(new InvalidArgument('encryptedData', 'Uint8Array', encryptedData));

    let data = encryptedData;
    if (!this._state.resourceIdKeyPair) {
      try {
        const { header, remaining } = await this._extractHeader(encryptedData);
        this._state.resourceIdKeyPair = header;
        data = remaining;
      } catch (err) {
        return done(err);
      }
    }

    if (data.length === 0) {
      return done();
    }

    this._resizerStream.write(data, done);
  }

  _flush(done) {
    this._decryptionStream.on('end', done);
    this._resizerStream.end();
  }
}
