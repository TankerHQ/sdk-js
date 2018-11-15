// @flow

import varint from 'varint';
import { Transform } from 'readable-stream';

import { aead, tcrypto } from '@tanker/crypto';
import { InvalidEncryptionFormat, InvalidArgument, NotEnoughData } from '../errors';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { Uint8Stream } from '../Uint8Stream';
import { defaultOutputSize, defaultEncryptionSize, encryptionSizeOverhead, configureInputStream, configureOutputStream, type ResourceIdKeyMapper, type StreamDecryptorParameters } from './StreamConfigs';
import PromiseWrapper from '../PromiseWrapper';

export default class StreamDecryptor {
  _mapper: ResourceIdKeyMapper;
  _onData: (Uint8Array) => Promise<void> | void;
  _onEnd: () => Promise<void> | void;
  _onError = (error) => {
    throw error;
  }
  _outputSize: number = defaultOutputSize;
  _decryptionSize: number;

  _resourceIdKeyPair: ?ResourceIdKeyPair;
  _index = 0;
  _waitingPromises: Array<PromiseWrapper<void>> = [];
  _endPromise: PromiseWrapper<void> = new PromiseWrapper();

  _inputStream: Uint8Stream;
  _decryptionStream: Transform;
  _outputStream: Uint8Stream;

  constructor(mapper: ResourceIdKeyMapper, parameters: StreamDecryptorParameters, decryptionSize: number = defaultEncryptionSize + encryptionSizeOverhead) {
    this._mapper = mapper;
    this._onData = parameters.onData;
    this._onEnd = parameters.onEnd;
    this._decryptionSize = decryptionSize;
    if (parameters.blockSize) {
      this._outputSize = parameters.blockSize;
    }

    this._inputStream = configureInputStream(this._decryptionSize, {
      onDrain: () => {
        for (const promise of this._waitingPromises) {
          promise.resolve();
        }
        this._waitingPromises = [];
      },
      onError: this._onError
    });
    this._configureEncryptionStream();
    this._outputStream = configureOutputStream(this._outputSize, {
      onData: this._onData,
      onEnd: this._endPromise.resolve,
      onError: this._onError
    });

    this._inputStream.pipe(this._decryptionStream).pipe(this._outputStream);
  }


  _configureEncryptionStream() {
    const deriveKey = this._deriveKey.bind(this);
    this._decryptionStream = new Transform({
      writableHighWaterMark: this._decryptionSize,
      readableHighWaterMark: this._outputSize,

      async transform(chunk, encoding, callback) {
        try {
          const subKey = deriveKey();
          const clearData = await aead.decryptAEADv2(subKey, chunk);
          this.push(clearData);
        } catch (err) {
          return callback(err);
        }
        callback();
      }
    });

    this._decryptionStream.on('error', this._onError);
  }

  _deriveKey() {
    // $FlowIKnow _resourceKeyPair is always defined during write
    const subKey = tcrypto.deriveKey(this._resourceIdKeyPair.key, this._index);
    this._index += 1;
    return subKey;
  }

  _findHeaderSizeFromVersion(version: number) {
    switch (version) {
      case 1:
        return tcrypto.MAC_SIZE;
      default:
        throw new InvalidEncryptionFormat(`unhandled format version in StreamDecryptor: '${version}'`);
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
        throw new InvalidEncryptionFormat(`unhandled format version in StreamDecryptor: '${version}'`);
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

  async write(encryptedData: Uint8Array): Promise<void> {
    let data = encryptedData;
    if (!this._resourceIdKeyPair) {
      const { header, remaining } = await this._extractHeader(encryptedData);
      this._resourceIdKeyPair = header;
      data = remaining;
    }

    if (data.length === 0) {
      return;
    }

    if (!this._inputStream.write(data)) {
      const promiseWrapper = new PromiseWrapper();
      this._waitingPromises.push(promiseWrapper);
      return promiseWrapper.promise;
    }
  }

  async close(): Promise<void> {
    this._inputStream.end();
    await this._endPromise.promise;

    return this._onEnd();
  }
}

export function makeStreamDecryptor(mapper: ResourceIdKeyMapper, parameters: StreamDecryptorParameters): StreamDecryptor {
  return new StreamDecryptor(mapper, parameters);
}
