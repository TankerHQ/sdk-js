// @flow

import { InvalidArgument } from '../errors';

export const statusDefs = [
  /* 0 */ { name: 'STOPPED' },
  /* 1 */ { name: 'READY' },
  /* 2 */ { name: 'IDENTITY_REGISTRATION_NEEDED' },
  /* 3 */ { name: 'IDENTITY_VERIFICATION_NEEDED' },
];

export const statuses: { [name: string]: number } = (() => {
  const h = {};
  statusDefs.forEach((def, index) => {
    h[def.name] = index;
  });
  return h;
})();

export type Status = $Values<typeof statuses>;

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
};

export type EmailVerificationMethod = {|
  email: string,
  verificationCode: string
|};

export type PassphraseVerificationMethod = {|
  passphrase: string
|};

type KeyVerificationMethod = {|
  verificationKey: string
|};

export type VerificationMethod = EmailVerificationMethod | PassphraseVerificationMethod | KeyVerificationMethod;

export const assertVerificationMethod = (verificationMethod: VerificationMethod) => {
  if (!verificationMethod || typeof verificationMethod !== 'object' || verificationMethod instanceof Array)
    throw new InvalidArgument('verificationMethod', 'object', verificationMethod);

  if (Object.keys(verificationMethod).some(k => k !== 'verificationKey' && k !== 'email' && k !== 'passphrase' && k !== 'verificationCode'))
    throw new InvalidArgument('verificationMethod', 'should only contain keys in ["email", "passphrase", "verificationCode", "verificationKey"]', verificationMethod);

  const methodCound = ['email', 'passphrase', 'verificationKey'].reduce((count, key) => count + (key in verificationMethod ? 1 : 0), 0);

  if (methodCound !== 1)
    throw new InvalidArgument('verificationMethod', 'should contain a single verification method in ["email", "passphrase", "verificationKey"]', verificationMethod);

  if ('email' in verificationMethod) {
    if (typeof verificationMethod.email !== 'string')
      throw new InvalidArgument('verificationMethod', 'email should be a string', verificationMethod.email);
    if (!('verificationCode' in verificationMethod))
      throw new InvalidArgument('verificationMethod', 'verificationMethod should also have a verificationCode', verificationMethod);
    if (typeof verificationMethod.verificationCode !== 'string')
      throw new InvalidArgument('verificationMethod', 'verificationCode should be a string', verificationMethod.verificationCode);
  } else if ('passphrase' in verificationMethod && typeof verificationMethod.passphrase !== 'string') {
    throw new InvalidArgument('verificationMethod', 'passphrase should be a string', verificationMethod.passphrase);
  } else if ('verificationKey' in verificationMethod && typeof verificationMethod.verificationKey !== 'string') {
    throw new InvalidArgument('verificationMethod', 'verificationKey should be a string', verificationMethod.verificationKey);
  }
};
