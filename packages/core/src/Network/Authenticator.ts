import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

export const CHALLENGE_PREFIX = '\u{0001F512} Auth Challenge. 1234567890.';

type ChallengeSignature = Uint8Array;

export type Authenticator = (challenge: string) => ChallengeSignature;

export function signChallenge(signatureKeyPair: tcrypto.SodiumKeyPair, challenge: string): ChallengeSignature {
  if (challenge.substr(0, CHALLENGE_PREFIX.length) !== CHALLENGE_PREFIX) {
    throw new InternalError('Received auth challenge has the wrong prefix! The server may not be up to date, or we may be under attack.');
  }
  return tcrypto.sign(utils.fromString(challenge), signatureKeyPair.privateKey);
}
