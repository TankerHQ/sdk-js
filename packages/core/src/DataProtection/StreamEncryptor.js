// @flow

import varint from 'varint';
import { Transform } from 'readable-stream';

import { utils, tcrypto, aead, type b64string } from '@tanker/crypto';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { concatArrays } from '../Blocks/Serialize';
import { InvalidArgument } from '../errors';
import BufferedTransformStream from '../Stream/BufferedTransformStream';
import { streamEncryptorVersion, defaultOutputSize, defaultEncryptionSize, type StreamEncryptorParameters } from './StreamConfigs';

export default class StreamEncryptor {
  _outputSize: number = defaultOutputSize;
  _encryptionSize: number;

  _state: {
    resourceIdKeyPair: ResourceIdKeyPair,
    index: number
  }

  _stream: BufferedTransformStream;

  constructor(resourceId: Uint8Array, key: Uint8Array, parameters: StreamEncryptorParameters, encryptionSize: number = defaultEncryptionSize) {
    this._encryptionSize = encryptionSize;
    if (parameters.outputSize) {
      this._outputSize = parameters.outputSize;
    }

    this._state = {
      resourceIdKeyPair: {
        key,
        resourceId
      },
      index: 0
    };

    const { onData, onEnd, onError } = parameters;
    const processingStream = this._makeEncryptionStream();

    this._stream = new BufferedTransformStream(
      processingStream,
      { onData, onEnd, onError },
      { inputSize: this._encryptionSize, outputSize: this._outputSize }
    );

    this._writeHeader();
  }

  _makeEncryptionStream() {
    const derive = this._deriveKey.bind(this);
    return new Transform({
      writableHighWaterMark: this._encryptionSize,
      readableHighWaterMark: this._outputSize,

      transform: async function transform(clearData, encoding, callback) {
        const subKey = derive();
        const eData = await aead.encryptAEADv2(subKey, clearData);
        this.push(eData);
        callback();
      }
    });
  }

  _deriveKey() {
    const subKey = tcrypto.deriveKey(this._state.resourceIdKeyPair.key, this._state.index);
    this._state.index += 1;
    return subKey;
  }

  _writeHeader() {
    const header = concatArrays(varint.encode(streamEncryptorVersion), this._state.resourceIdKeyPair.resourceId);
    this._stream.output(header);
  }

  resourceId(): b64string {
    return utils.toBase64(this._state.resourceIdKeyPair.resourceId);
  }

  async write(clearData: Uint8Array): Promise<void> {
    if (!(clearData instanceof Uint8Array))
      throw new InvalidArgument('clearData', 'Uint8Array', clearData);

    return this._stream.write(clearData);
  }

  async close(): Promise<void> {
    return this._stream.close();
  }
}

export function makeStreamEncryptor(streamResource: ResourceIdKeyPair, parameters: StreamEncryptorParameters): StreamEncryptor {
  return new StreamEncryptor(streamResource.resourceId, streamResource.key, parameters);
}
