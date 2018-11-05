// @flow

import varint from 'varint';

import { utils, aead, tcrypto, type b64string } from '@tanker/crypto';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { concatArrays } from '../Blocks/Serialize';
import { type ShareWithOptions } from './ShareWithOptions';

export type StreamEncryptorParameters = ShareWithOptions & {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  blockSize?: number,
  shareWithSelf?: bool
}

export const streamEncryptorVersion = 1;

export const defaultBlockSize = Number('10e6');

export default class StreamEncryptor {
  _onData: (Uint8Array) => Promise<void> | void;
  _onEnd: () => Promise<void> | void;
  _blockSize: number = defaultBlockSize;

  _resourceId: Uint8Array;
  _key: Uint8Array;

  _index = 0;
  _outputBuffer: Uint8Array = new Uint8Array(0);

  constructor(resourceId: Uint8Array, key: Uint8Array, parameters: StreamEncryptorParameters) {
    this._onData = parameters.onData;
    this._onEnd = parameters.onEnd;
    if (parameters.blockSize) {
      this._blockSize = parameters.blockSize;
    }

    this._key = key;
    this._resourceId = resourceId;

    this._outputBuffer = concatArrays(varint.encode(streamEncryptorVersion), resourceId);
  }

  resourceId(): b64string {
    return utils.toBase64(this._resourceId);
  }

  async _handleBufferedOutput() {
    let offset = 0;
    let remaining = this._outputBuffer.length;

    while (remaining >= this._blockSize) {
      await this._onData(this._outputBuffer.subarray(offset, offset + this._blockSize));
      offset += this._blockSize;
      remaining -= this._blockSize;
    }

    this._outputBuffer = this._outputBuffer.subarray(offset);
  }

  async write(clearData: Uint8Array): Promise<void> {
    const key = tcrypto.deriveKey(this._key, this._index);
    this._index += 1;
    this._outputBuffer = concatArrays(this._outputBuffer, await aead.encryptAEADv2(key, clearData));

    return this._handleBufferedOutput();
  }

  async close(): Promise<void> {
    if (this._outputBuffer.length > this._blockSize) {
      await this._handleBufferedOutput();
    } else if (this._outputBuffer.length > 0) {
      await this._onData(this._outputBuffer);
    }
    return this._onEnd();
  }
}

export function makeStreamEncryptor(streamResource: ResourceIdKeyPair, parameters: StreamEncryptorParameters): StreamEncryptor {
  return new StreamEncryptor(streamResource.resourceId, streamResource.key, parameters);
}
