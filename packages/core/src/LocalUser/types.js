// @flow
import { InvalidArgument } from '@tanker/errors';

export type EmailVerificationMethod = $Exact<{ type: 'email', email: string }>;
type PassphraseVerificationMethod = $Exact<{ type: 'passphrase' }>;
type KeyVerificationMethod = $Exact<{ type: 'verificationKey' }>;

export type VerificationMethod = EmailVerificationMethod | PassphraseVerificationMethod | KeyVerificationMethod;

export type EmailVerification = $Exact<{ email: string, verificationCode: string }>;
export type PassphraseVerification = $Exact<{ passphrase: string }>;
export type KeyVerification = $Exact<{ verificationKey: string }>;
export type OIDCVerification = $Exact<{ oidcIdToken: string }>;

export type Verification = EmailVerification | PassphraseVerification | KeyVerification | OIDCVerification;
export type RemoteVerification = EmailVerification | PassphraseVerification | OIDCVerification;

const validMethods = ['email', 'passphrase', 'verificationKey', 'oidcIdToken'];
const validKeys = [...validMethods, 'verificationCode'];

const assertNotEmptyString = (verification: Verification, key: string) => {
  const value = verification[key];
  if (typeof value !== 'string') {
    throw new InvalidArgument('verification', `${key} should be a string`, value);
  }
  if (!value) {
    throw new InvalidArgument('verification', `${key} should not be empty`, value);
  }
};

export const assertVerification = (verification: Verification) => {
  if (!verification || typeof verification !== 'object' || verification instanceof Array)
    throw new InvalidArgument('verification', 'object', verification);

  if (Object.keys(verification).some(k => !validKeys.includes(k)))
    throw new InvalidArgument('verification', `should only contain keys in ${JSON.stringify(validKeys)}`, verification);

  const methodCound = validMethods.reduce((count, key) => count + (key in verification ? 1 : 0), 0);

  if (methodCound !== 1)
    throw new InvalidArgument('verification', `should contain a single verification method in ${JSON.stringify(validMethods)}`, verification);

  if ('email' in verification) {
    assertNotEmptyString(verification, 'email');
    if (!('verificationCode' in verification)) {
      throw new InvalidArgument('verification', 'email verification should also have a verificationCode', verification);
    }
    assertNotEmptyString(verification, 'verificationCode');
  } else if ('passphrase' in verification) {
    assertNotEmptyString(verification, 'passphrase');
  } else if ('verificationKey' in verification) {
    assertNotEmptyString(verification, 'verificationKey');
  } else if ('oidcIdToken' in verification) {
    assertNotEmptyString(verification, 'oidcIdToken');
  }
};
