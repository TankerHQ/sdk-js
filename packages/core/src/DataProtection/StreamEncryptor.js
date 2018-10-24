// @flow

import { utils, type b64string } from '@tanker/crypto';

export type StreamEncryptorParameters = {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  blockSize?: number,
  shareWith?: Array<string>
}

export const defaultBlockSize = Number('10e6');

export default class StreamEncryptor {
  _onData: (Uint8Array) => Promise<void> | void;
  _onEnd: () => Promise<void> | void;
  _blockSize: number = defaultBlockSize;
  _resourceId: Uint8Array;
  _key: Uint8Array;

  constructor(resourceId: Uint8Array, resourceKey: Uint8Array, parameters: StreamEncryptorParameters) {
    this._onData = parameters.onData;
    this._onEnd = parameters.onEnd;
    if (parameters.blockSize) {
      this._blockSize = parameters.blockSize;
    }
    this._resourceId = resourceId;
    this._key = resourceKey;
  }

  resourceId(): b64string {
    return utils.toBase64(this._resourceId);
  }

  write(clearData: Uint8Array): Promise<void> { // eslint-disable-line no-unused-vars
    throw new Error('not implemented yet');
  }

  close(): Promise<void> {
    throw new Error('not implemented yet');
  }
}

export function makeStreamEncryptor(resourceId: Uint8Array, resourcekey: Uint8Array, parameters: StreamEncryptorParameters): StreamEncryptor {
  return new StreamEncryptor(resourceId, resourcekey, parameters);
}
