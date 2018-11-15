// @flow

import { type Key } from '@tanker/crypto';
import { type ShareWithOptions } from './ShareWithOptions';
import { Uint8Stream } from '../Uint8Stream';

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

export function configureInputStream(inputSize: number, callback: { onDrain: Function, onError: Function }) {
  const inputStream = new Uint8Stream(inputSize);

  inputStream.on('drain', callback.onDrain);
  inputStream.on('error', callback.onError);
  return inputStream;
}

export function configureOutputStream(outputSize: number, callback: { onData: Function, onEnd: Function, onError: Function }) {
  const outputStream = new Uint8Stream(outputSize);

  outputStream.on('data', async (data) => {
    outputStream.pause();
    try {
      await callback.onData(data);
    } catch (err) {
      callback.onError(err);
    }
    outputStream.resume();
  });
  outputStream.on('end', callback.onEnd);
  outputStream.on('error', callback.onError);
  return outputStream;
}
