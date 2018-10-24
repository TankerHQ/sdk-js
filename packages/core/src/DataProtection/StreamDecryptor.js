// @flow

import { defaultBlockSize } from './StreamEncryptor';

export type StreamDecryptorParameters = {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  blockSize?: number,
}

export default class StreamDecryptor {
  _onData: (Uint8Array) => Promise<void> | void;
  _onEnd: () => Promise<void> | void;
  _blockSize: number = defaultBlockSize;

  constructor(parameters: StreamDecryptorParameters) {
    this._onData = parameters.onData;
    this._onEnd = parameters.onEnd;
    if (parameters.blockSize) {
      this._blockSize = parameters.blockSize;
    }
  }

  write(clearData: Uint8Array): Promise<void> { // eslint-disable-line no-unused-vars
    throw new Error('not implemented yet');
  }

  close(): Promise<void> {
    throw new Error('not implemented yet');
  }
}

export function makeStreamDecryptor(parameters: StreamDecryptorParameters): StreamDecryptor {
  return new StreamDecryptor(parameters);
}
