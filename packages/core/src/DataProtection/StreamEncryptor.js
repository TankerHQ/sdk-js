// @flow

import varint from 'varint';
import { Transform } from 'readable-stream';

import { utils, aead, tcrypto, type b64string } from '@tanker/crypto';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { concatArrays } from '../Blocks/Serialize';
import { type ShareWithOptions } from './ShareWithOptions';
import { Uint8BufferStream, defaultBlockSize } from '../Uint8Stream';

export type StreamEncryptorParameters = ShareWithOptions & {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  blockSize?: number,
  shareWithSelf?: bool
}

export const streamEncryptorVersion = 1;

export default class StreamEncryptor {
  _onData: (Uint8Array) => Promise<void> | void;
  _onEnd: () => Promise<void> | void;
  _blockSize: number = defaultBlockSize;

  _resourceId: Uint8Array;
  _key: Uint8Array;

  _index = 0;
  _outputStream: Uint8BufferStream;
  _encryptionStream: Transform;

  constructor(resourceId: Uint8Array, key: Uint8Array, parameters: StreamEncryptorParameters) {
    this._onData = parameters.onData;
    this._onEnd = parameters.onEnd;
    if (parameters.blockSize) {
      this._blockSize = parameters.blockSize;
    }

    this._key = key;
    this._resourceId = resourceId;

    this._outputStream = new Uint8BufferStream(this._blockSize);
    this._outputStream.on('readable', () => {
      const data = this._outputStream.read();
      if (data)
        this._onData(new Uint8Array(data, 0, data.length));
    });

    const that = this;
    this._encryptionStream = new Transform({
      async transform(clearData, encoding, callback) {
        // eslint-disable-next-line no-underscore-dangle
        const subKey = tcrypto.deriveKey(that._key, that._index);
        // eslint-disable-next-line no-underscore-dangle
        that._index += 1;
        const eData = await aead.encryptAEADv2(subKey, clearData);
        this.push(eData);
        callback();
      }
    });
    this._encryptionStream.pipe(this._outputStream);

    const formatHeader = concatArrays(varint.encode(streamEncryptorVersion), resourceId);
    this._outputStream.write(formatHeader);
  }

  resourceId(): b64string {
    return utils.toBase64(this._resourceId);
  }

  async write(clearData: Uint8Array): Promise<void> {
    this._encryptionStream.write(clearData);
  }

  async close(): Promise<void> {
    this._encryptionStream.end();
    this._outputStream.end();

    return this._onEnd();
  }
}

export function makeStreamEncryptor(streamResource: ResourceIdKeyPair, parameters: StreamEncryptorParameters): StreamEncryptor {
  return new StreamEncryptor(streamResource.resourceId, streamResource.key, parameters);
}
