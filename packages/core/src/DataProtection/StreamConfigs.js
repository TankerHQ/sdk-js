// @flow

import { type Key, tcrypto } from '@tanker/crypto';
import { type ShareWithOptions } from './ShareWithOptions';
import { InvalidArgument } from '../errors';

export const defaultEncryptionSize = 1024 * 1024;
export const defaultOutputSize = defaultEncryptionSize;
export const defaultDecryptionSize = defaultEncryptionSize + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD;

export const streamEncryptorVersion = 1;

export type StreamEncryptorParameters = {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  onError?: (Error) => Promise<void> | void,
  outputSize?: number,
  shareOptions?: ShareWithOptions,
  shareWithSelf?: bool
}

export type StreamDecryptorParameters = {
  onData: (Uint8Array) => Promise<void> | void,
  onEnd: () => Promise<void> | void,
  onError?: (Error) => Promise<void> | void,
  outputSize?: number,
}

export type ResourceIdKeyMapper = {
  findKey: (Uint8Array) => Promise<Key>
}

export function assertStreamParameters(parameters: any) {
  if (typeof parameters !== 'object' || parameters === null)
    throw new InvalidArgument('parameters', 'Object', parameters);
  const { onData, onEnd, onError, outputSize } = parameters;
  if (!(onData instanceof Function))
    throw new InvalidArgument('parameters.onData', 'onData callback not set', onData);
  if (!(onEnd instanceof Function))
    throw new InvalidArgument('parameters.onEnd', 'onEnd callback not set', onEnd);
  if (onError && !(onError instanceof Function))
    throw new InvalidArgument('parameters.onError', 'onError must be a callback function', onEnd);
  if ('outputSize' in parameters && typeof outputSize !== 'number')
    throw new InvalidArgument('parameters.outputSize', 'Number', outputSize);
  if ('outputSize' in parameters && (isNaN(outputSize) || outputSize <= 0 || outputSize === Infinity || outputSize === -Infinity || outputSize % 1 !== 0)) // eslint-disable-line no-restricted-globals
    throw new InvalidArgument('parameters.outputSize', 'outputSize must be a strict positive integer', outputSize);
}
