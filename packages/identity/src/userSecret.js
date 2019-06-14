// @flow
import { generichash, random, utils, type b64string } from '@tanker/crypto';
import { obfuscateUserId } from './userId';

export const USER_SECRET_SIZE = 32;

const { fromBase64, toBase64 } = utils;

function checksumByte(secretRand: Uint8Array, userIdBytes: Uint8Array): number {
  const hashSize = 16;
  const input = new Uint8Array(USER_SECRET_SIZE - 1 + userIdBytes.length);
  input.set(secretRand);
  input.set(userIdBytes, USER_SECRET_SIZE - 1);
  return generichash(input, hashSize)[0];
}

export function createUserSecretBinary(trustchainId: b64string, userId: string): Uint8Array {
  if (typeof trustchainId !== 'string')
    throw new Error('Assertion error: invalid Trustchain ID.');

  if (typeof userId !== 'string')
    throw new Error('Assertion error: invalid user ID.');

  const rand = random(USER_SECRET_SIZE - 1);
  const checkByte = checksumByte(rand, obfuscateUserId(fromBase64(trustchainId), userId));
  const secret = new Uint8Array(USER_SECRET_SIZE);
  secret.set(rand);
  secret[USER_SECRET_SIZE - 1] = checkByte;
  return secret;
}

export function createUserSecretB64(trustchainId: b64string, userId: string): b64string {
  return toBase64(createUserSecretBinary(trustchainId, userId));
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
