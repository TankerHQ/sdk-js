// @flow
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '../errors';

export const CHALLENGE_PREFIX = '\u{0001F512} Auth Challenge. 1234567890.';

type AuthDeviceParams = {
  signature: Uint8Array,
  publicSignatureKey: Uint8Array,
  trustchainId: Uint8Array,
  userId: Uint8Array,
}

export type Authenticator = (string) => AuthDeviceParams;

export function takeChallenge(trustchainId: Uint8Array, userId: Uint8Array, signatureKeyPair: tcrypto.SodiumKeyPair, challenge: string): AuthDeviceParams {
  if (challenge.substr(0, CHALLENGE_PREFIX.length) !== CHALLENGE_PREFIX)
    throw new InternalError('Received auth challenge has the wrong prefix! The server may not be up to date, or we may be under attack.');
  const signature = tcrypto.sign(utils.fromString(challenge), signatureKeyPair.privateKey);
  return {
    signature,
    publicSignatureKey: signatureKeyPair.publicKey,
    trustchainId,
    userId,
  };
}
