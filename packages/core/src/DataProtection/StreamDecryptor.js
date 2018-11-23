// @flow

import varint from 'varint';
import { Transform } from 'readable-stream';

import { aead, tcrypto } from '@tanker/crypto';
import { InvalidEncryptionFormat, InvalidArgument, NotEnoughData, BrokenStream, DecryptFailed, StreamAlreadyClosed } from '../errors';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { Uint8Stream } from '../Uint8Stream';
import { defaultOutputSize, defaultDecryptionSize, configureInputStream, configureOutputStream, type ResourceIdKeyMapper, type StreamDecryptorParameters } from './StreamConfigs';
import PromiseWrapper from '../PromiseWrapper';

export default class StreamDecryptor {
  _mapper: ResourceIdKeyMapper;
  _onEnd: () => Promise<void> | void;
  _outputSize: number = defaultOutputSize;
  _decryptionSize: number;

  _resourceIdKeyPair: ?ResourceIdKeyPair;
  _index = 0;
  _waitingPromise: ?PromiseWrapper<void>;
  _endPromise: ?PromiseWrapper<void>;
  _error: ?Error;
  _closed: bool = false;

  _inputStream: Uint8Stream;
  _decryptionStream: Transform;
  _outputStream: Uint8Stream;

  constructor(mapper: ResourceIdKeyMapper, parameters: StreamDecryptorParameters, decryptionSize: number = defaultDecryptionSize) {
    this._mapper = mapper;
    this._onEnd = parameters.onEnd;
    const onError = (error) => {
      this._error = error;
      try {
        if (parameters.onError) {
          parameters.onError(error);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (this._waitingPromise) {
          this._waitingPromise.reject(new BrokenStream(error));
        }
        if (this._endPromise) {
          this._endPromise.reject(new BrokenStream(error));
        }
      }
    };
    this._decryptionSize = decryptionSize;
    if (parameters.blockSize) {
      this._outputSize = parameters.blockSize;
    }

    this._inputStream = configureInputStream(this._decryptionSize, {
      onDrain: () => {
        if (this._waitingPromise) {
          const promise = this._waitingPromise;
          delete this._waitingPromise;
          promise.resolve();
        }
      },
      onError
    });
    this._configureDecryptionStream(onError);
    this._outputStream = configureOutputStream(this._outputSize, {
      onData: parameters.onData,
      onEnd: () => {
        if (this._endPromise) {
          this._endPromise.resolve();
        } else {
          throw new Error('Stream is closing without endPromise');
        }
      },
      onError
    });

    this._inputStream.pipe(this._decryptionStream).pipe(this._outputStream);
  }


  _configureDecryptionStream(onError: Function) {
    const deriveKey = this._deriveKey.bind(this);
    const resourceId = (() =>
      // $FlowIKnow _resourceKeyPair is always defined during write
      this._resourceIdKeyPair.resourceId
    );
    this._decryptionStream = new Transform({
      writableHighWaterMark: this._decryptionSize,
      readableHighWaterMark: this._outputSize,

      transform: async function transform(chunk, encoding, callback) {
        let clearData;
        const subKey = deriveKey();
        try {
          clearData = await aead.decryptAEADv2(subKey, chunk);
        } catch (error) {
          return callback(new DecryptFailed(error, resourceId()));
        }

        this.push(clearData);
        callback();
      }
    });

    this._decryptionStream.on('error', onError);
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
    if (!(encryptedData instanceof Uint8Array))
      throw new InvalidArgument('encryptedData', 'Uint8Array', encryptedData);

    if (this._error) {
      throw new BrokenStream(this._error);
    }
    if (this._closed) {
      throw new StreamAlreadyClosed();
    }

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
      if (!this._waitingPromise) {
        this._waitingPromise = new PromiseWrapper();
      }
      return this._waitingPromise.promise;
    }
  }

  async close(): Promise<void> {
    if (this._error) {
      throw new BrokenStream(this._error);
    }
    if (this._closed) {
      throw new StreamAlreadyClosed();
    }

    this._closed = true;
    this._endPromise = new PromiseWrapper();
    this._inputStream.end();
    // $FlowIKnow got assigne two ligne upper
    await this._endPromise.promise;
    return this._onEnd();
  }
}

export function makeStreamDecryptor(mapper: ResourceIdKeyMapper, parameters: StreamDecryptorParameters): StreamDecryptor {
  return new StreamDecryptor(mapper, parameters);
}
