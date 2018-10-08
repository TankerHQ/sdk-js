// @flow
import { utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from './errors';
import { TANKER_SDK_VERSION } from './version';

export function toBase64(bytes: Uint8Array): b64string {
  if (!(bytes instanceof Uint8Array))
    throw new InvalidArgument('bytes', 'Uint8Array', bytes);

  return utils.toBase64(bytes);
}

export function fromBase64(str: b64string): Uint8Array {
  if (typeof str !== 'string')
    throw new InvalidArgument('str', 'b64string', str);

  return utils.fromBase64(str);
}

export function toString(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array))
    throw new InvalidArgument('bytes', 'Uint8Array', bytes);

  return utils.toString(bytes);
}

export function fromString(str: string): Uint8Array {
  if (typeof str !== 'string')
    throw new InvalidArgument('str', 'string', str);

  return utils.fromString(str);
}

export function compareSameSizeUint8Arrays(left: Uint8Array, right: Uint8Array): number {
  if (left.length !== right.length)
    throw new Error('AssertionError: arguments in compareSameSizeArrays do not have the same size');
  for (let i = 0; i < left.length; i++) {
    if (left[i] < right[i])
      return -1;
    else if (left[i] > right[i])
      return 1;
  }
  return 0;
}

export function getTankerVersion(): string {
  return TANKER_SDK_VERSION;
}

// Because IE11: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex#Browser_compatibility
export function findIndex<T>(array: Array<T>, predicate: T => bool): number {
  if (Array.prototype.findIndex)
    return array.findIndex(predicate);

  for (let i = 0; i < array.length; ++i) // eslint-disable-line no-plusplus
    if (predicate(array[i]))
      return i;

  return -1;
}
