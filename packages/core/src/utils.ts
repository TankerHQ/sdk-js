import type { b64string } from '@tanker/crypto';
import { ready as cryptoReady, utils, tcrypto, generichash } from '@tanker/crypto';
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

export async function prehashPassword(password: string): Promise<b64string> {
  assertNotEmptyString(password, 'password');

  await cryptoReady;

  return utils.toBase64(utils.prehashPassword(utils.fromString(password)));
}

export async function prehashAndEncryptPassword(password: string, publicKey: b64string): Promise<b64string> {
  assertNotEmptyString(password, 'password');
  utils.assertB64StringWithSize(publicKey, 'publicKey', 32);

  await cryptoReady;

  const prehashedPassword = generichash(utils.fromString(password));
  return toBase64(tcrypto.sealEncrypt(prehashedPassword, fromBase64(publicKey)));
}
