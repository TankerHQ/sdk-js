// @flow
import { tcrypto, utils } from '@tanker/crypto';
import { type UserData } from '../Tokens/UserData';
import { type AuthDeviceParams } from '../Network/Client';

export const CHALLENGE_PREFIX = '\u{0001F512} Auth Challenge. 1234567890.';

export function takeChallenge(userData: UserData, signatureKeyPair: tcrypto.SodiumKeyPair, challenge: string): AuthDeviceParams {
  if (challenge.substr(0, CHALLENGE_PREFIX.length) !== CHALLENGE_PREFIX)
    throw new Error('Received auth challenge has the wrong prefix! The server may not be up to date, or we may be under attack.');
  const signature = tcrypto.sign(utils.fromString(challenge), signatureKeyPair.privateKey);
  return {
    signature,
    publicSignatureKey: signatureKeyPair.publicKey,
    trustchainId: userData.trustchainId,
    userId: userData.userId,
  };
}
