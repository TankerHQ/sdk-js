import { InvalidArgument } from '@tanker/errors';
import { assertNotEmptyString } from '@tanker/types';

export type LegacyEmailVerificationMethod = { type: 'email' };
export type EmailVerificationMethod = { type: 'email'; email: string; };
export type PassphraseVerificationMethod = { type: 'passphrase'; };
export type KeyVerificationMethod = { type: 'verificationKey'; };
export type OIDCVerificationMethod = { type: 'oidcIdToken'; };
export type PhoneNumberVerificationMethod = { type: 'phoneNumber'; phoneNumber: string; };

export type ProvisionalVerificationMethod = EmailVerificationMethod | PhoneNumberVerificationMethod;
export type VerificationMethod = PassphraseVerificationMethod | KeyVerificationMethod | OIDCVerificationMethod | EmailVerificationMethod | PhoneNumberVerificationMethod;

export type EmailVerification = { email: string; verificationCode: string; };
export type PassphraseVerification = { passphrase: string; };
export type KeyVerification = { verificationKey: string; };
export type OIDCVerification = { oidcIdToken: string; };
export type PhoneNumberVerification = { phoneNumber: string; verificationCode: string; };

export type ProvisionalVerification = EmailVerification | PhoneNumberVerification;
export type Verification = PassphraseVerification | KeyVerification | OIDCVerification | EmailVerification | PhoneNumberVerification;
export type RemoteVerification = EmailVerification | PassphraseVerification | OIDCVerification | PhoneNumberVerification;

export type WithTokenOptions = { withToken?: { nonce: string; }; };
export type VerificationWithToken = Verification & WithTokenOptions;
export type RemoteVerificationWithToken = RemoteVerification & WithTokenOptions;

export type VerificationOptions = { withSessionToken?: boolean; };

const validMethods = ['email', 'passphrase', 'verificationKey', 'oidcIdToken', 'phoneNumber'];
const validKeys = [...validMethods, 'verificationCode'];

const validVerifOptionsKeys = ['withSessionToken'];

export const assertVerification = (verification: Verification) => {
  if (!verification || typeof verification !== 'object' || verification instanceof Array)
    throw new InvalidArgument('verification', 'object', verification);

  if (Object.keys(verification).some(k => !validKeys.includes(k)))
    throw new InvalidArgument('verification', `should only contain keys in ${JSON.stringify(validKeys)}`, verification);

  const methodCound = validMethods.reduce((count, key) => count + (key in verification ? 1 : 0), 0);

  if (methodCound !== 1)
    throw new InvalidArgument('verification', `should contain a single verification method in ${JSON.stringify(validMethods)}`, verification);

  if ('email' in verification) {
    assertNotEmptyString(verification.email, 'verification.email');
    if (!('verificationCode' in verification)) {
      throw new InvalidArgument('verification', 'email verification should also have a verificationCode', verification);
    }
    assertNotEmptyString(verification.verificationCode, 'verification.verificationCode');
  } else if ('phoneNumber' in verification) {
    assertNotEmptyString(verification.phoneNumber, 'verification.phoneNumber');
    if (!('verificationCode' in verification)) {
      throw new InvalidArgument('verification', 'phone verification should also have a verificationCode', verification);
    }
    assertNotEmptyString(verification.verificationCode, 'verification.verificationCode');
  } else if ('passphrase' in verification) {
    assertNotEmptyString(verification.passphrase, 'verification.passphrase');
  } else if ('verificationKey' in verification) {
    assertNotEmptyString(verification.verificationKey, 'verification.verificationKey');
  } else if ('oidcIdToken' in verification) {
    assertNotEmptyString(verification.oidcIdToken, 'verification.oidcIdToken');
  }
};

export function assertVerificationOptions(options: any): asserts options is VerificationOptions | null | undefined {
  if (!options)
    return;

  if (typeof options !== 'object' || options instanceof Array) {
    throw new InvalidArgument('options', 'object', options);
  }

  if (Object.keys(options!).some(k => !validVerifOptionsKeys.includes(k)))
    throw new InvalidArgument('options', `should only contain keys in ${JSON.stringify(validVerifOptionsKeys)}`, options);

  if ('withSessionToken' in options! && typeof options!.withSessionToken !== 'boolean')
    throw new InvalidArgument('options', 'withSessionToken must be a boolean', options);
}
