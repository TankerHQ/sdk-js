import { encryptionV2, generichash, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import type { EmailVerification, PassphraseVerification } from '..';

import type LocalUser from './LocalUser';
import type { OIDCVerification, PhoneNumberVerification, RemoteVerification, RemoteVerificationWithToken } from './types';
import type { SecretProvisionalIdentity } from '../Identity';

export type VerificationRequest = {
  hashed_passphrase: Uint8Array;
  with_token?: { nonce: string; };
} | {
  hashed_email: Uint8Array;
  v2_encrypted_email: Uint8Array;
  verification_code: string;
  with_token?: { nonce: string; };
} | {
  oidc_id_token: string;
  with_token?: { nonce: string; };
} | {
  phone_number: string;
  encrypted_phone_number: Uint8Array;
  user_salt: Uint8Array;
  provisional_salt?: Uint8Array,
  verification_code: string;
  with_token?: { nonce: string; };
};

export type ProvisionalKeysRequest = {
  target: string;
  email: string;
} | {
  target: string;
  phone_number: string;
  user_secret_salt: Uint8Array;
  provisional_salt: Uint8Array;
};

export const formatVerificationRequest = (
  verification: RemoteVerification | RemoteVerificationWithToken,
  localUser: LocalUser,
  provIdentity?: SecretProvisionalIdentity,
): VerificationRequest => {
  const asEmail = verification as EmailVerification;
  if (asEmail.email) {
    return {
      hashed_email: generichash(utils.fromString(asEmail.email)),
      v2_encrypted_email: encryptionV2.serialize(encryptionV2.encrypt(localUser.userSecret, utils.fromString(asEmail.email))),
      verification_code: asEmail.verificationCode,
    };
  }

  const asPassphrase = verification as PassphraseVerification;
  if (asPassphrase.passphrase) {
    return {
      hashed_passphrase: generichash(utils.fromString(asPassphrase.passphrase)),
    };
  }

  const asPhoneNumber = verification as PhoneNumberVerification;
  if (asPhoneNumber.phoneNumber) {
    return {
      phone_number: asPhoneNumber.phoneNumber,
      encrypted_phone_number: encryptionV2.serialize(encryptionV2.encrypt(localUser.userSecret, utils.fromString(asPhoneNumber.phoneNumber))),
      user_salt: generichash(localUser.userSecret),
      provisional_salt: provIdentity ? generichash(utils.fromBase64(provIdentity.private_signature_key)) : undefined,
      verification_code: asPhoneNumber.verificationCode,
    };
  }

  const asOIDC = verification as OIDCVerification;
  if (asOIDC.oidcIdToken) {
    return {
      oidc_id_token: asOIDC.oidcIdToken,
    };
  }

  throw new InternalError('Assertion error: invalid remote verification in formatVerificationRequest');
};

export const formatProvisionalKeysRequest = (provIdentity: SecretProvisionalIdentity, localUser: LocalUser): ProvisionalKeysRequest => {
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
