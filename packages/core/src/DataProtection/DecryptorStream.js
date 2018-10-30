// @flow

import varint from 'varint';

import { aead, tcrypto } from '@tanker/crypto';
import { Transform } from '@tanker/stream-base';

import { InvalidEncryptionFormat, NotEnoughData, DecryptFailed } from '../errors';
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

  constructor(mapper: ResourceIdKeyMapper, decryptionSize: number = defaultDecryptionSize) {
    super({
      writableHighWaterMark: decryptionSize,
      readableHighWaterMark: decryptionSize - tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD,
    });

    this._mapper = mapper;
    this._decryptionSize = decryptionSize;
    this._state = {
      resourceIdKeyPair: null,
      index: 0
    };
  }

  _deriveKey() {
    // $FlowIKnow _resourceKeyPair is always defined during write
    const subKey = tcrypto.deriveKey(this._state.resourceIdKeyPair.key, this._state.index);
    this._state.index += 1;
    return subKey;
  }

  _findHeaderSizeFromVersion(version: number) {
    switch (version) {
      case 4:
        return tcrypto.MAC_SIZE;
      default:
        throw new InvalidEncryptionFormat(`unhandled format version in DecryptorStream: '${version}'`);
    }
  }

  async _findResourceIdKeyPair(version: number, binaryData: Uint8Array) {
    switch (version) {
      case 4:
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

  async _transform(encryptedData: Uint8Array, encoding: ?string, done: Function) {
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

    let clearData;
    const subKey = this._deriveKey();
    try {
      clearData = await aead.decryptAEADv2(subKey, data);
    } catch (error) {
      // $FlowIKnow _resourceKeyPair is always defined during write
      return done(new DecryptFailed(error, this._state.resourceIdKeyPair.resourceId));
    }
    this.push(clearData);
    done();
  }
}
