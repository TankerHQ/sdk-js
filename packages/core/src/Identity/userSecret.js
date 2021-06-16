// @flow
import { generichash } from '@tanker/crypto';

export const USER_SECRET_SIZE = 32;

function checksumByte(secretRand: Uint8Array, userIdBytes: Uint8Array): number {
  const hashSize = 16;
  const input = new Uint8Array(USER_SECRET_SIZE - 1 + userIdBytes.length);
  input.set(secretRand);
  input.set(userIdBytes, USER_SECRET_SIZE - 1);
  return generichash(input, hashSize)[0];
}

export function assertUserSecret(userId: Uint8Array, secret: Uint8Array) {
  if (!(userId instanceof Uint8Array))
    throw new Error(`Assertion error: bad userId provided, expected a Uint8Array but got ${userId}`);

  if (!(secret instanceof Uint8Array))
    throw new Error(`Assertion error: bad secret provided, expected a Uint8Array but got ${secret}`);

  if (secret.length !== USER_SECRET_SIZE)
    throw new Error(`Assertion error: invalid secret length, expected ${USER_SECRET_SIZE} but got ${secret.length}`);

  const checkByte = checksumByte(secret.subarray(0, USER_SECRET_SIZE - 1), userId);
  if (checkByte !== secret[USER_SECRET_SIZE - 1])
    throw new Error('Secret does not match the user ID');
}
