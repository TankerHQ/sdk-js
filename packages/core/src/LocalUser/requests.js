// @flow

import { encryptionV2, generichash, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type LocalUser from './LocalUser';
import type { RemoteVerification, RemoteVerificationWithToken, WithTokenOptions } from './types';

type VerificationRequest = $Exact<{
  hashed_passphrase: Uint8Array,
  ...WithTokenOptions
}> | $Exact<{
  hashed_email: Uint8Array,
  v2_encrypted_email: Uint8Array,
  verification_code: string,
  ...WithTokenOptions
}> | $Exact<{
  oidc_id_token: string,
  ...WithTokenOptions
}>;

export const formatVerificationRequest = (verification: RemoteVerification | RemoteVerificationWithToken, localUser: LocalUser): VerificationRequest => {
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
  if (verification.oidcIdToken) {
    return {
      oidc_id_token: verification.oidcIdToken,
    };
  }
  throw new InternalError('Assertion error: invalid remote verification in formatVerificationRequest');
};
