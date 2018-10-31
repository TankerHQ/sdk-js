// @flow

import varint from 'varint';

import { aead, tcrypto, type Key } from '@tanker/crypto';
import { InvalidEncryptionFormat } from '../errors';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { defaultBlockSize } from './StreamEncryptor';

export type StreamDecryptorParameters = {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  blockSize?: number,
}

export type ResourceIdKeyMapper = {
  findKey: (Uint8Array) => Promise<Key>
}

export default class StreamDecryptor {
  _mapper: ResourceIdKeyMapper;
  _onData: (Uint8Array) => Promise<void> | void;
  _onEnd: () => Promise<void> | void;
  _blockSize: number = defaultBlockSize;
  _resourceIdKeyPair: ?ResourceIdKeyPair;
  _index = 0;

  async _findAndRemoveKeyFromData(encryptedData: Uint8Array) {
    const version = varint.decode(encryptedData);
    const binaryData = encryptedData.subarray(varint.decode.bytes);

    switch (version) {
      case 1:
      {
        const resourceId = binaryData.subarray(0, tcrypto.MAC_SIZE);
        return {
          binaryData: binaryData.subarray(tcrypto.MAC_SIZE),
          key: await this._mapper.findKey(resourceId),
          resourceId
        };
      }
      default:
        throw new InvalidEncryptionFormat(`unhandled format version in StreamDecryptor: '${version}'`);
    }
  }

  constructor(mapper: ResourceIdKeyMapper, parameters: StreamDecryptorParameters) {
    this._mapper = mapper;
    this._onData = parameters.onData;
    this._onEnd = parameters.onEnd;
    if (parameters.blockSize) {
      this._blockSize = parameters.blockSize;
    }
  }

  async write(encryptedData: Uint8Array): Promise<void> {
    let data = encryptedData;
    if (!this._resourceIdKeyPair) {
      const { binaryData, key, resourceId } = await this._findAndRemoveKeyFromData(encryptedData);
      this._resourceIdKeyPair = {
        key,
        resourceId
      };
      data = binaryData;
    }

    const subKey = tcrypto.deriveKey(this._resourceIdKeyPair.key, this._index);
    this._index += 1;
    return this._onData(await aead.decryptAEADv2(subKey, data));
  }

  async close(): Promise<void> {
    return this._onEnd();
  }
}

export function makeStreamDecryptor(mapper: ResourceIdKeyMapper, parameters: StreamDecryptorParameters): StreamDecryptor {
  return new StreamDecryptor(mapper, parameters);
}
