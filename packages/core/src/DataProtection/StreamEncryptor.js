// @flow

import varint from 'varint';

import { utils, aead, tcrypto, type b64string } from '@tanker/crypto';
import { type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { concatArrays } from '../Blocks/Serialize';
import { type ShareWithArg } from './DataProtector';

export type StreamEncryptorParameters = {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  blockSize?: number,
  shareWith?: ShareWithArg,
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
  _formatHeader: ?Uint8Array;

  constructor(resourceId: Uint8Array, key: Uint8Array, parameters: StreamEncryptorParameters) {
    this._onData = parameters.onData;
    this._onEnd = parameters.onEnd;
    if (parameters.blockSize) {
      this._blockSize = parameters.blockSize;
    }

    this._key = key;
    this._resourceId = resourceId;

    this._formatHeader = concatArrays(varint.encode(streamEncryptorVersion), resourceId);
  }

  resourceId(): b64string {
    return utils.toBase64(this._resourceId);
  }

  async write(clearData: Uint8Array): Promise<void> {
    if (this._formatHeader) {
      await this._onData(this._formatHeader);
      this._formatHeader = null;
    }
    const key = tcrypto.deriveKey(this._key, this._index);
    this._index += 1;
    return this._onData(await aead.encryptAEADv2(key, clearData));
  }

  async close(): Promise<void> {
    return this._onEnd();
  }
}

export function makeStreamEncryptor(streamResource: ResourceIdKeyPair, parameters: StreamEncryptorParameters): StreamEncryptor {
  return new StreamEncryptor(streamResource.resourceId, streamResource.key, parameters);
}
