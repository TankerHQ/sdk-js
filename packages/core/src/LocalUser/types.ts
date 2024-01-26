import { InvalidArgument } from '@tanker/errors';
import { assertNotEmptyString, assertNever } from '@tanker/types';

export type LegacyEmailVerificationMethod = { type: 'email' };
export type EmailVerificationMethod = { type: 'email'; email: string; };
export type PassphraseVerificationMethod = { type: 'passphrase'; };
export type E2ePassphraseVerificationMethod = { type: 'e2ePassphrase'; };
export type KeyVerificationMethod = { type: 'verificationKey'; };
export type OidcVerificationMethod = { type: 'oidcIdToken'; providerId: string; providerDisplayName: string; };
export type PhoneNumberVerificationMethod = { type: 'phoneNumber'; phoneNumber: string; };
export type PreverifiedEmailVerificationMethod = { type: 'preverifiedEmail'; preverifiedEmail: string; };
export type PreverifiedPhoneNumberVerificationMethod = { type: 'preverifiedPhoneNumber'; preverifiedPhoneNumber: string; };

export type ProvisionalVerificationMethod = EmailVerificationMethod | PhoneNumberVerificationMethod;
export type VerificationMethod = PassphraseVerificationMethod | E2ePassphraseVerificationMethod | KeyVerificationMethod | OidcVerificationMethod | EmailVerificationMethod | PhoneNumberVerificationMethod | PreverifiedEmailVerificationMethod | PreverifiedPhoneNumberVerificationMethod;

export type EmailVerification = { email: string; verificationCode: string; };
export type PassphraseVerification = { passphrase: string; };
export type E2ePassphraseVerification = { e2ePassphrase: string; };
export type KeyVerification = { verificationKey: string; };
export type OidcAuthorizationCodeVerification = { oidcProviderId: string; oidcAuthorizationCode: string; oidcState: string; };
export type OidcVerification = { oidcIdToken: string; };
export type PhoneNumberVerification = { phoneNumber: string; verificationCode: string; };
export type PreverifiedEmailVerification = { preverifiedEmail: string; };
export type PreverifiedPhoneNumberVerification = { preverifiedPhoneNumber: string; };
export type PreverifiedOidcVerification = { preverifiedOidcSubject: string; oidcProviderId: string };
export type PreverifiedVerification = PreverifiedEmailVerification | PreverifiedPhoneNumberVerification | PreverifiedOidcVerification;

export type ProvisionalVerification = EmailVerification | PhoneNumberVerification;
export type E2eRemoteVerification = E2ePassphraseVerification;
export type RemoteVerification = E2eRemoteVerification
| EmailVerification
| PassphraseVerification
| OidcAuthorizationCodeVerification
| OidcVerification
| PhoneNumberVerification
| PreverifiedEmailVerification
| PreverifiedPhoneNumberVerification
| PreverifiedOidcVerification;
export type Verification = RemoteVerification | KeyVerification;

export type WithTokenOptions = { withToken?: { nonce: string; }; };
export type VerificationWithToken = Verification & WithTokenOptions;
export type RemoteVerificationWithToken = RemoteVerification & WithTokenOptions;

export type VerificationOptions = { withSessionToken?: boolean; allowE2eMethodSwitch?: boolean; };

const validE2eMethods = ['e2ePassphrase'];
const validNonE2eMethods = ['email', 'passphrase', 'verificationKey', 'oidcIdToken', 'oidcAuthorizationCode', 'phoneNumber', 'preverifiedEmail', 'preverifiedPhoneNumber', 'preverifiedOidcSubject'];
const validMethods = [...validE2eMethods, ...validNonE2eMethods];
const validKeys = [...validMethods, 'verificationCode', 'oidcProviderId', 'oidcState'];

const validVerifOptionsKeys = ['withSessionToken', 'allowE2eMethodSwitch'];

export const isE2eVerification = (verification: VerificationWithToken): verification is E2eRemoteVerification => Object.keys(verification).some(k => validE2eMethods.includes(k));

export const isNonE2eVerification = (verification: VerificationWithToken) => Object.keys(verification).some(k => validNonE2eMethods.includes(k));

export const isPreverifiedVerification = (verification: VerificationWithToken): verification is PreverifiedVerification => 'preverifiedEmail' in verification || 'preverifiedPhoneNumber' in verification || 'preverifiedOidcSubject' in verification;

export const isPreverifiedVerificationMethod = (verificationMethod: VerificationMethod): verificationMethod is (PreverifiedEmailVerificationMethod | PreverifiedPhoneNumberVerificationMethod) => verificationMethod.type === 'preverifiedEmail' || verificationMethod.type === 'preverifiedPhoneNumber';

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
  } else if ('e2ePassphrase' in verification) {
    assertNotEmptyString(verification.e2ePassphrase, 'verification.e2ePassphrase');
  } else if ('verificationKey' in verification) {
    assertNotEmptyString(verification.verificationKey, 'verification.verificationKey');
  } else if ('oidcIdToken' in verification) {
    assertNotEmptyString(verification.oidcIdToken, 'verification.oidcIdToken');
    if ('testNonce' in verification) {
      console.warn("'testNonce' field should be used for tests purposes only. It will be rejected for non-test Tanker application");
    }
  } else if ('oidcAuthorizationCode' in verification) {
    assertNotEmptyString(verification.oidcProviderId, 'verification.oidcProviderId');
    assertNotEmptyString(verification.oidcAuthorizationCode, 'verification.oidcAuthorizationCode');
    assertNotEmptyString(verification.oidcState, 'verification.oidcState');
  } else if ('preverifiedEmail' in verification) {
    assertNotEmptyString(verification.preverifiedEmail, 'verification.preverifiedEmail');
  } else if ('preverifiedPhoneNumber' in verification) {
    assertNotEmptyString(verification.preverifiedPhoneNumber, 'verification.preverifiedPhoneNumber');
  } else if ('preverifiedOidcSubject' in verification) {
    assertNotEmptyString(verification.preverifiedOidcSubject, 'verification.preverifiedOidcSubject');
    if (!('oidcProviderId' in verification)) {
      throw new InvalidArgument('verification', 'oidc pre-verification should also have a oidcProviderId', verification);
    }
    assertNotEmptyString(verification.oidcProviderId, 'verification.oidcProviderId');
  }
};

export function assertVerifications(verifications: Array<Verification>) {
  if (!verifications || typeof verifications !== 'object' || !(verifications instanceof Array)) {
    throw new InvalidArgument('verifications', 'array', verifications);
  }

  verifications.forEach(assertVerification);
}

function hasWithSessionToken(options: object): options is { withSessionToken: unknown } {
  return 'withSessionToken' in options;
}

function hasAllowE2eMethodSwitch(options: object): options is { allowE2eMethodSwitch: unknown } {
  return 'allowE2eMethodSwitch' in options;
}

export function assertVerificationOptions(options: unknown): asserts options is VerificationOptions | null | undefined {
  if (!options)
    return;

  if (typeof options !== 'object' || options instanceof Array) {
    throw new InvalidArgument('options', 'object', options);
  }

  if (Object.keys(options).some(k => !validVerifOptionsKeys.includes(k)))
    throw new InvalidArgument('options', `should only contain keys in ${JSON.stringify(validVerifOptionsKeys)}`, options);

  if (hasWithSessionToken(options) && typeof options.withSessionToken !== 'boolean')
    throw new InvalidArgument('options', 'withSessionToken must be a boolean', options);
  if (hasAllowE2eMethodSwitch(options) && typeof options.allowE2eMethodSwitch !== 'boolean')
    throw new InvalidArgument('options', 'allowE2eMethodSwitch must be a boolean', options);
}

export const countPreverifiedVerifications = (verifications: Array<PreverifiedVerification>) => {
  const counts = {
    preverifiedEmail: 0,
    preverifiedPhoneNumber: 0,
    preverifiedOidcSubject: 0,
  };
  verifications.forEach((verification) => {
    if ('preverifiedEmail' in verification) {
      counts.preverifiedEmail += 1;
    } else if ('preverifiedPhoneNumber' in verification) {
      counts.preverifiedPhoneNumber += 1;
    } else if ('preverifiedOidcSubject' in verification) {
      counts.preverifiedOidcSubject += 1;
    } else {
      assertNever(verification, 'verification');
    }
  });
  return counts;
};
