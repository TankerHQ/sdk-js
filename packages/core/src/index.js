// @flow

// import
import {
  DecryptionFailed,
  ExpiredVerification,
  GroupTooBig,
  IdentityAlreadyAttached,
  InternalError,
  InvalidArgument,
  InvalidVerification,
  NetworkError,
  OperationCanceled,
  PreconditionFailed,
  TankerError,
  TooManyAttempts,
  DeviceRevoked,
  UpgradeRequired,
} from '@tanker/errors';

import { Tanker, optionsWithDefaults } from './Tanker';
import { statuses } from './Session/status';
import { fromBase64, toBase64, prehashPassword } from './utils';

// export
export default Tanker;

export type { b64string } from '@tanker/crypto';
export type { ResourceMetadata } from '@tanker/types';
export type { OutputOptions, FormatOptions, ProgressOptions, SharingOptions } from './DataProtection/options';
export type { EmailVerification, PassphraseVerification, KeyVerification, Verification, VerificationMethod } from './LocalUser/types';
export type { TankerOptions } from './Tanker';

const errors = {
  DecryptionFailed,
  DeviceRevoked,
  ExpiredVerification,
  GroupTooBig,
  IdentityAlreadyAttached,
  InternalError,
  InvalidArgument,
  InvalidVerification,
  NetworkError,
  OperationCanceled,
  PreconditionFailed,
  TankerError,
  TooManyAttempts,
  UpgradeRequired,
};

export {
  Tanker,
  errors,
  fromBase64,
  optionsWithDefaults,
  statuses,
  toBase64,
  prehashPassword,
};
