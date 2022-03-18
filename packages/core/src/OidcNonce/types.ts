import type { b64string } from '@tanker/crypto';

export const challengePrefix = 'oidc-verification-prefix';
export const challengeLengthByte = 24;

export type SignedChallenge = {
  challenge: b64string;
  signature: b64string;
};
