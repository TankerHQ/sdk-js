// @flow
import crypto from 'crypto';
import { generichash, HASH_MIN_SIZE } from './hash';
import { concatArrays, toBase64, fromBase64, fromString } from './utils';
import { type b64string } from './aliases';

export const USER_SECRET_SIZE = 32;

export function random(size: number): Uint8Array {
  if (typeof window !== 'undefined') {
    const myCrypto = window.crypto || window.msCrypto;

    if (myCrypto && myCrypto.getRandomValues) {
      const buffer = new Uint8Array(size);
      myCrypto.getRandomValues(buffer);
      return buffer;
    }
  }

  return new Uint8Array(crypto.randomBytes(size));
}

function userSecretHash(secretRand: Uint8Array, userIdBytes: Uint8Array): Uint8Array {
  const input = new Uint8Array(USER_SECRET_SIZE - 1 + userIdBytes.length);
  input.set(secretRand);
  input.set(userIdBytes, USER_SECRET_SIZE - 1);
  return generichash(input, HASH_MIN_SIZE);
}

export function obfuscateUserId(trustchainId: Uint8Array, userId: string): Uint8Array {
  return generichash(concatArrays(fromString(userId), trustchainId));
}

export function createUserSecretBinary(trustchainId: b64string, userId: string): Uint8Array {
  if (typeof trustchainId !== 'string')
    throw new TypeError('Invalid Trustchain ID.');

  if (typeof userId !== 'string')
    throw new TypeError('Invalid user ID.');

  const rand = random(USER_SECRET_SIZE - 1);
  const check = userSecretHash(rand, obfuscateUserId(fromBase64(trustchainId), userId));
  const checkByte = check[0];
  const secret = new Uint8Array(USER_SECRET_SIZE);
  secret.set(rand);
  secret[USER_SECRET_SIZE - 1] = checkByte;
  return secret;
}

export function createUserSecretB64(trustchainId: b64string, userId: string): b64string {
  return toBase64(createUserSecretBinary(trustchainId, userId));
}

export function checkUserSecret(userId: Uint8Array, secret: Uint8Array) {
  if (!(userId instanceof Uint8Array))
    throw new TypeError(`Bad userId provided, expected a Uint8Array but got ${userId}`);

  if (!(secret instanceof Uint8Array))
    throw new TypeError(`Bad secret provided, expected a Uint8Array but got ${secret}`);

  if (secret.length !== USER_SECRET_SIZE)
    throw new Error(`Invalid secret length. Expecting ${USER_SECRET_SIZE}, got ${secret.length}`);

  const check = userSecretHash(secret.subarray(0, USER_SECRET_SIZE - 1), userId);
  if (check[0] !== secret[USER_SECRET_SIZE - 1])
    throw new Error('Secret does not match the user ID');
}
