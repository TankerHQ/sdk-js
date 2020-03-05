// @flow
import { utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';

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

// Because IE11: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex#Browser_compatibility
export function findIndex<T>(array: Array<T>, predicate: T => bool): number {
  if (Array.prototype.findIndex)
    return array.findIndex(predicate);

  for (let i = 0; i < array.length; ++i) // eslint-disable-line no-plusplus
    if (predicate(array[i]))
      return i;

  return -1;
}


export function prehashPassword(password: string): b64string {
  return utils.toBase64(utils.prehashPassword(utils.fromString(password)));
}
