// @flow
import { InvalidArgument } from '@tanker/errors';
import { assertNotEmptyString } from '@tanker/types';

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

export const assertVerification = (verification: Verification) => {
  if (!verification || typeof verification !== 'object' || verification instanceof Array)
    throw new InvalidArgument('verification', 'object', verification);

  if (Object.keys(verification).some(k => !validKeys.includes(k)))
    throw new InvalidArgument('verification', `should only contain keys in ${JSON.stringify(validKeys)}`, verification);

  const methodCound = validMethods.reduce((count, key) => count + (key in verification ? 1 : 0), 0);

  if (methodCound !== 1)
    throw new InvalidArgument('verification', `should contain a single verification method in ${JSON.stringify(validMethods)}`, verification);

  if ('email' in verification) {
    // $FlowIgnore[prop-missing]
    assertNotEmptyString(verification.email, 'verification.email');
    if (!('verificationCode' in verification)) {
      throw new InvalidArgument('verification', 'email verification should also have a verificationCode', verification);
    }
    // $FlowIgnore[prop-missing]
    assertNotEmptyString(verification.verificationCode, 'verification.verificationCode');
  } else if ('passphrase' in verification) {
    // $FlowIgnore[prop-missing]
    assertNotEmptyString(verification.passphrase, 'verification.passphrase');
  } else if ('verificationKey' in verification) {
    // $FlowIgnore[prop-missing]
    assertNotEmptyString(verification.verificationKey, 'verification.verificationKey');
  } else if ('oidcIdToken' in verification) {
    // $FlowIgnore[prop-missing]
    assertNotEmptyString(verification.oidcIdToken, 'verification.oidcIdToken');
  }
};
