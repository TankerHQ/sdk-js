import { EncryptionV2, generichash, utils } from '@tanker/crypto';
import type { b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type { RemoteVerification, RemoteVerificationWithToken, PreverifiedVerification } from './types';
import type { SecretProvisionalIdentity } from '../Identity';
import type { SignedChallenge } from '../OidcNonce/types';

type WithToken<T> = T & { with_token?: { nonce: string; } | undefined };
type WithVerificationCode<T> = WithToken<T> & { verification_code: string; };
type Preverified<T> = T & { is_preverified: true };

type PassphraseRequest = {
  hashed_passphrase: Uint8Array;
};
type EmailRequest = {
  hashed_email: Uint8Array;
  v2_encrypted_email: Uint8Array;
};
type OidcIdTokenRequest = {
  oidc_id_token: string;
  oidc_challenge: b64string;
  oidc_challenge_signature: b64string;
  oidc_test_nonce: string | undefined;
};
type OidcAuthorizationCode = {
  oidc_provider_id: string;
  oidc_authorization_code: string;
  oidc_state: string;
};
type PhoneNumberRequest = {
  phone_number: string;
  encrypted_phone_number: Uint8Array;
  user_salt: Uint8Array;
  provisional_salt: Uint8Array | undefined;
};
type E2ePassphraseRequest = {
  hashed_e2e_passphrase: Uint8Array;
};
type OidcRequest = {
  oidc_subject: string,
  oidc_provider_id: string,
};

export type PreverifiedVerificationRequest = Preverified<EmailRequest> | Preverified<PhoneNumberRequest> | Preverified<OidcRequest>;

export type VerificationRequestWithToken = WithToken<PassphraseRequest>
| WithVerificationCode<EmailRequest>
| WithToken<OidcAuthorizationCode>
| WithToken<OidcIdTokenRequest>
| WithVerificationCode<PhoneNumberRequest>
| WithToken<E2ePassphraseRequest>;
export type VerificationRequest = VerificationRequestWithToken | PreverifiedVerificationRequest;

export type ProvisionalKeysRequest = {
  target: 'email';
  email: string;
} | {
  target: 'phone_number';
  phone_number: string;
  user_secret_salt: Uint8Array;
  provisional_salt: Uint8Array;
};

export type SetVerificationMethodRequest = {
  verification: VerificationRequest,
  encrypted_verification_key_for_user_secret?: Uint8Array,
  encrypted_verification_key_for_user_key?: Uint8Array,
  encrypted_verification_key_for_e2e_passphrase?: Uint8Array,
};

export const isPreverifiedVerificationRequest = (request: VerificationRequest): request is PreverifiedVerificationRequest => ('is_preverified' in request && request.is_preverified);

interface VerificationRequestHelperInterface {
  localUser: { userSecret: Uint8Array };
  challengeOidcToken (idToken: string, nonce?: string): Promise<SignedChallenge>;
  getOidcTestNonce(): Promise<b64string | undefined>;
}

export const formatVerificationRequest = async (
  verification: RemoteVerification | RemoteVerificationWithToken,
  helper: VerificationRequestHelperInterface,
  provIdentity?: SecretProvisionalIdentity,
): Promise<VerificationRequest> => {
  const { localUser } = helper;

  if ('email' in verification) {
    return {
      hashed_email: generichash(utils.fromString(verification.email)),
      v2_encrypted_email: EncryptionV2.serialize(EncryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.email))),
      verification_code: verification.verificationCode,
    };
  }

  if ('passphrase' in verification) {
    return {
      hashed_passphrase: generichash(utils.fromString(verification.passphrase)),
    };
  }

  if ('phoneNumber' in verification) {
    return {
      phone_number: verification.phoneNumber,
      encrypted_phone_number: EncryptionV2.serialize(EncryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.phoneNumber))),
      user_salt: generichash(localUser.userSecret),
      provisional_salt: provIdentity ? generichash(utils.fromBase64(provIdentity.private_signature_key)) : undefined,
      verification_code: verification.verificationCode,
    };
  }

  if ('oidcIdToken' in verification) {
    const testNonce = await helper.getOidcTestNonce();
    const { challenge, signature } = await helper.challengeOidcToken(verification.oidcIdToken, testNonce);
    return {
      oidc_id_token: verification.oidcIdToken,
      oidc_challenge: challenge,
      oidc_challenge_signature: signature,
      oidc_test_nonce: testNonce,
    };
  }

  if ('preverifiedOidcSubject' in verification) {
    return {
      oidc_provider_id: verification.oidcProviderId,
      oidc_subject: verification.preverifiedOidcSubject,
      is_preverified: true,
    };
  }

  if ('oidcAuthorizationCode' in verification) {
    return {
      oidc_authorization_code: verification.oidcAuthorizationCode,
      oidc_provider_id: verification.oidcProviderId,
      oidc_state: verification.oidcState,
    };
  }

  if ('preverifiedEmail' in verification) {
    return {
      hashed_email: generichash(utils.fromString(verification.preverifiedEmail)),
      v2_encrypted_email: EncryptionV2.serialize(EncryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.preverifiedEmail))),
      is_preverified: true,
    };
  }

  if ('preverifiedPhoneNumber' in verification) {
    return {
      phone_number: verification.preverifiedPhoneNumber,
      encrypted_phone_number: EncryptionV2.serialize(EncryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.preverifiedPhoneNumber))),
      user_salt: generichash(localUser.userSecret),
      provisional_salt: provIdentity ? generichash(utils.fromBase64(provIdentity.private_signature_key)) : undefined,
      is_preverified: true,
    };
  }

  if ('e2ePassphrase' in verification) {
    return {
      hashed_e2e_passphrase: utils.prehashE2eVerificationPassphrase(utils.fromString(verification.e2ePassphrase)),
    };
  }

  throw new InternalError('Assertion error: invalid remote verification in formatVerificationRequest');
};

export const formatVerificationsRequest = (verifications: Array<PreverifiedVerification>, helper: VerificationRequestHelperInterface): Promise<Array<PreverifiedVerificationRequest>> => Promise.all(
  verifications.map((verification) => formatVerificationRequest(verification, helper) as Promise<PreverifiedVerificationRequest>),
);

export const formatProvisionalKeysRequest = (provIdentity: SecretProvisionalIdentity, localUser: { userSecret: Uint8Array }): ProvisionalKeysRequest => {
  if (provIdentity.target === 'email') {
    return {
      target: provIdentity.target,
      email: provIdentity.value,
    };
  }
  if (provIdentity.target === 'phone_number') {
    return {
      target: provIdentity.target,
      phone_number: provIdentity.value,
      user_secret_salt: generichash(localUser.userSecret),
      provisional_salt: generichash(utils.fromBase64(provIdentity.private_signature_key)),
    };
  }
  throw new InternalError('Assertion error: invalid provisional identity target in formatProvisionalKeysRequest');
};
