import { encryptionV2, generichash, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type LocalUser from './LocalUser';
import type { RemoteVerification, RemoteVerificationWithToken } from './types';
import type { SecretProvisionalIdentity } from '../Identity';

export type VerificationRequestWithToken = {
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

export type VerificationRequest = VerificationRequestWithToken | {
  hashed_email: Uint8Array;
  v2_encrypted_email: Uint8Array;
  is_preverified: boolean;
} | {
  phone_number: string;
  encrypted_phone_number: Uint8Array;
  user_salt: Uint8Array;
  provisional_salt?: Uint8Array,
  is_preverified: boolean;
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

export const isPreverifiedVerificationRequest = (request: VerificationRequest): request is Exclude<VerificationRequest, VerificationRequestWithToken> => ('is_preverified' in request && request.is_preverified);

export const formatVerificationRequest = (
  verification: RemoteVerification | RemoteVerificationWithToken,
  localUser: LocalUser,
  provIdentity?: SecretProvisionalIdentity,
): VerificationRequest => {
  if ('email' in verification) {
    return {
      hashed_email: generichash(utils.fromString(verification.email)),
      v2_encrypted_email: encryptionV2.serialize(encryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.email))),
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
      encrypted_phone_number: encryptionV2.serialize(encryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.phoneNumber))),
      user_salt: generichash(localUser.userSecret),
      provisional_salt: provIdentity ? generichash(utils.fromBase64(provIdentity.private_signature_key)) : undefined,
      verification_code: verification.verificationCode,
    };
  }

  if ('oidcIdToken' in verification) {
    return {
      oidc_id_token: verification.oidcIdToken,
    };
  }

  if ('preverifiedEmail' in verification) {
    return {
      hashed_email: generichash(utils.fromString(verification.preverifiedEmail)),
      v2_encrypted_email: encryptionV2.serialize(encryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.preverifiedEmail))),
      is_preverified: true,
    };
  }

  if ('preverifiedPhoneNumber' in verification) {
    return {
      phone_number: verification.preverifiedPhoneNumber,
      encrypted_phone_number: encryptionV2.serialize(encryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.preverifiedPhoneNumber))),
      user_salt: generichash(localUser.userSecret),
      provisional_salt: provIdentity ? generichash(utils.fromBase64(provIdentity.private_signature_key)) : undefined,
      is_preverified: true,
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
