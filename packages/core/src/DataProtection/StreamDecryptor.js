// @flow

import varint from 'varint';
import { Transform } from 'readable-stream';

import { aead, tcrypto } from '@tanker/crypto';
import { InvalidEncryptionFormat, InvalidArgument, NotEnoughData, DecryptFailed } from '../errors';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import BufferedTransformStream from '../Stream/BufferedTransformStream';
import { defaultOutputSize, defaultDecryptionSize, type ResourceIdKeyMapper, type StreamDecryptorParameters } from './StreamConfigs';

export default class StreamDecryptor {
  _mapper: ResourceIdKeyMapper;
  _outputSize: number = defaultOutputSize;
  _decryptionSize: number;

  _state: {
    resourceIdKeyPair: ?ResourceIdKeyPair,
    index: number
  };

  _stream: BufferedTransformStream;

  constructor(mapper: ResourceIdKeyMapper, parameters: StreamDecryptorParameters, decryptionSize: number = defaultDecryptionSize) {
    this._mapper = mapper;
    this._decryptionSize = decryptionSize;
    if (parameters.outputSize) {
      this._outputSize = parameters.outputSize;
    }

    this._state = {
      resourceIdKeyPair: null,
      index: 0
    };
    const { onData, onEnd, onError } = parameters;
    const processingStream = this._makeDecryptionStream();

    this._stream = new BufferedTransformStream(
      processingStream,
      { onData, onEnd, onError },
      { inputSize: this._decryptionSize, outputSize: this._outputSize }
    );
  }


  _makeDecryptionStream() {
    const derive = this._deriveKey.bind(this);
    // $FlowIKnow _resourceKeyPair is always defined during write
    const resourceId = () => this._state.resourceIdKeyPair.resourceId;
    return new Transform({
      writableHighWaterMark: this._decryptionSize,
      readableHighWaterMark: this._outputSize,

      transform: async function transform(chunk, encoding, callback) {
        let clearData;
        const subKey = derive();
        try {
          clearData = await aead.decryptAEADv2(subKey, chunk);
        } catch (error) {
          return callback(new DecryptFailed(error, resourceId()));
        }

        this.push(clearData);
        callback();
      }
    });
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

    this._stream.integrityCheck();

    let data = encryptedData;
    if (!this._state.resourceIdKeyPair) {
      const { header, remaining } = await this._extractHeader(encryptedData);
      this._state.resourceIdKeyPair = header;
      data = remaining;
    }

    if (data.length === 0) {
      return;
    }

    return this._stream.write(data);
  }

  close(): Promise<void> {
    return this._stream.close();
  }
}

export function makeStreamDecryptor(mapper: ResourceIdKeyMapper, parameters: StreamDecryptorParameters): StreamDecryptor {
  return new StreamDecryptor(mapper, parameters);
}
