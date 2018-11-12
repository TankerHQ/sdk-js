// @flow

import { type Key } from '@tanker/crypto';
import { type ShareWithOptions } from './ShareWithOptions';

export const defaultEncryptionSize = Number('10e5');
export const defaultOutputSize = defaultEncryptionSize;

// TODO: mv this const to tcrypto
export const encryptionSizeOverhead = 40;

export const streamEncryptorVersion = 1;

export type StreamEncryptorParameters = {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  blockSize?: number,
  shareOptions?: ShareWithOptions,
  shareWithSelf?: bool
}

export type StreamDecryptorParameters = {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  blockSize?: number,
}

export type ResourceIdKeyMapper = {
  findKey: (Uint8Array) => Promise<Key>
}
