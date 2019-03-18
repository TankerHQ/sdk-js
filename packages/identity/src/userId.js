// @flow
import { generichash, utils } from '@tanker/crypto';

const { concatArrays, fromString } = utils;

export function obfuscateUserId(trustchainId: Uint8Array, userId: string): Uint8Array {
  return generichash(concatArrays(fromString(userId), trustchainId));
}
