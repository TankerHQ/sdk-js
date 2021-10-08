import type { b64string } from '@tanker/crypto';
import { ready as cryptoReady, utils } from '@tanker/crypto';
import { assertString, assertNotEmptyString } from '@tanker/types';
import { InvalidArgument } from '@tanker/errors';

export function toBase64(bytes: Uint8Array): b64string {
  if (!(bytes instanceof Uint8Array))
    throw new InvalidArgument('bytes', 'Uint8Array', bytes);

  return utils.toBase64(bytes);
}

export function fromBase64(str: b64string): Uint8Array {
  assertString(str, 'str');
  return utils.fromBase64(str);
}

// Keep this function asynchronous for compat with future asynchronous libsodium init
export async function prehashPassword(password: string): Promise<b64string> {
  assertNotEmptyString(password, 'password');

  await cryptoReady;

  return utils.toBase64(utils.prehashPassword(utils.fromString(password)));
}
