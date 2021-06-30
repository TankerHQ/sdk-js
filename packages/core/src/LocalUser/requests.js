// @flow

import { encryptionV2, generichash, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type LocalUser from './LocalUser';
import type { RemoteVerification, RemoteVerificationWithToken } from './types';
import type { SecretProvisionalIdentity } from '../Identity';

export type VerificationRequest = $Exact<{
  hashed_passphrase: Uint8Array,
  with_token?: {| nonce: string |}
}> | $Exact<{
  hashed_email: Uint8Array,
  v2_encrypted_email: Uint8Array,
  verification_code: string,
  with_token?: {| nonce: string |}
}> | $Exact<{
  oidc_id_token: string,
  with_token?: {| nonce: string |}
}> | $Exact<{
  phone_number: string,
  encrypted_phone_number: Uint8Array,
  user_salt: Uint8Array,
  provisional_salt?: Uint8Array,
  verification_code: string,
  with_token?: {| nonce: string |}
}>;

export type ProvisionalKeysRequest = $Exact<{
  target: string,
  email: string,
}> | $Exact<{
  target: string,
  phone_number: string,
  user_secret_salt: Uint8Array,
  provisional_salt: Uint8Array,
}>;

export const formatVerificationRequest = (
  verification: RemoteVerification | RemoteVerificationWithToken,
  localUser: LocalUser,
  provIdentity: ?SecretProvisionalIdentity
): VerificationRequest => {
  if (verification.email) {
    return {
      hashed_email: generichash(utils.fromString(verification.email)),
      v2_encrypted_email: encryptionV2.serialize(encryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.email))),
      verification_code: verification.verificationCode,
    };
  }
  if (verification.passphrase) {
    return {
      hashed_passphrase: generichash(utils.fromString(verification.passphrase)),
    };
  }
  if (verification.phoneNumber) {
    return {
      phone_number: verification.phoneNumber,
      encrypted_phone_number: encryptionV2.serialize(encryptionV2.encrypt(localUser.userSecret, utils.fromString(verification.phoneNumber))),
      user_salt: generichash(localUser.userSecret),
      provisional_salt: provIdentity ? generichash(utils.fromBase64(provIdentity.private_signature_key)) : undefined,
      verification_code: verification.verificationCode,
    };
  }
  if (verification.oidcIdToken) {
    return {
      oidc_id_token: verification.oidcIdToken,
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
