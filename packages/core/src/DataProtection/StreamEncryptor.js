// @flow

import varint from 'varint';
import { Transform } from 'readable-stream';

import { utils, aead, tcrypto, type b64string } from '@tanker/crypto';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { concatArrays } from '../Blocks/Serialize';
import { Uint8Stream } from '../Uint8Stream';
import PromiseWrapper from '../PromiseWrapper';
import { InvalidArgument } from '../errors';
import { streamEncryptorVersion, defaultOutputSize, defaultEncryptionSize, configureInputStream, configureOutputStream, type StreamEncryptorParameters } from './StreamConfigs';

export default class StreamEncryptor {
  _onEnd: () => Promise<void> | void;
  _outputSize: number = defaultOutputSize;
  _encryptionSize: number;

  _resourceId: Uint8Array;
  _key: Uint8Array;
  _index = 0;

  _waitingPromise: PromiseWrapper<void> = new PromiseWrapper();
  _endPromise: PromiseWrapper<void> = new PromiseWrapper();

  _inputStream: Uint8Stream;
  _encryptionStream: Transform;
  _outputStream: Uint8Stream;

  constructor(resourceId: Uint8Array, key: Uint8Array, parameters: StreamEncryptorParameters, encryptionSize: number = defaultEncryptionSize) {
    this._onEnd = parameters.onEnd;
    const onError = (error) => {
      throw error;
    };
    this._encryptionSize = encryptionSize;
    if (parameters.blockSize) {
      this._outputSize = parameters.blockSize;
    }

    this._key = key;
    this._resourceId = resourceId;

    this._inputStream = configureInputStream(this._encryptionSize, {
      onDrain: () => {
        const promise = this._waitingPromise;
        this._waitingPromise = new PromiseWrapper();
        promise.resolve();
      },
      onError
    });
    this._configureEncryptionStream(onError);
    this._outputStream = configureOutputStream(this._outputSize, {
      onData: parameters.onData,
      onEnd: this._endPromise.resolve,
      onError
    });

    this._inputStream.pipe(this._encryptionStream).pipe(this._outputStream);

    this._writeHeader();
  }

  _configureEncryptionStream(onError: Function) {
    const deriveKey = this._deriveKey.bind(this);
    this._encryptionStream = new Transform({
      writableHighWaterMark: this._encryptionSize,
      readableHighWaterMark: this._outputSize,

      async transform(clearData, encoding, callback) {
        const subKey = deriveKey();
        const eData = await aead.encryptAEADv2(subKey, clearData);
        this.push(eData);
        callback();
      }
    });

    this._encryptionStream.on('error', onError);
  }

  _writeHeader() {
    const header = concatArrays(varint.encode(streamEncryptorVersion), this._resourceId);
    this._outputStream.write(header);
  }

  _deriveKey() {
    const subKey = tcrypto.deriveKey(this._key, this._index);
    this._index += 1;
    return subKey;
  }

  resourceId(): b64string {
    return utils.toBase64(this._resourceId);
  }

  async write(clearData: Uint8Array): Promise<void> {
    if (!(clearData instanceof Uint8Array))
      throw new InvalidArgument('clearData', 'Uint8Array', clearData);

    if (!this._inputStream.write(clearData)) {
      return this._waitingPromise.promise;
    }
  }

  async close(): Promise<void> {
    this._inputStream.end();
    await this._endPromise.promise;
    return this._onEnd();
  }
}

export function makeStreamEncryptor(streamResource: ResourceIdKeyPair, parameters: StreamEncryptorParameters): StreamEncryptor {
  return new StreamEncryptor(streamResource.resourceId, streamResource.key, parameters);
}
