// @flow

import { Session } from './Session';

export const SIGN_IN_RESULT = Object.freeze({
  OK: 1,
  IDENTITY_VERIFICATION_NEEDED: 2,
  IDENTITY_NOT_REGISTERED: 3,
});

export type SignInResult = $Values<typeof SIGN_IN_RESULT>;

export type OpenResult = {|
  signInResult: SignInResult,
  session?: Session,
|};

export type SignInOptions = {|
  unlockKey?: string,
  verificationCode?: string,
  password?: string,
|};

export type DelegationToken = {
  ephemeral_public_signature_key: Uint8Array,
  ephemeral_private_signature_key: Uint8Array,
  user_id: Uint8Array,
  delegation_signature: Uint8Array,
  last_reset: Uint8Array,
}

export type UserData = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  userSecret: Uint8Array,
  delegationToken: DelegationToken,
}
