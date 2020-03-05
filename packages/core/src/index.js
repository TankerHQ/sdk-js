// @flow

// import
import {
  DecryptionFailed,
  ExpiredVerification,
  GroupTooBig,
  InternalError,
  InvalidArgument,
  InvalidVerification,
  NetworkError,
  OperationCanceled,
  PreconditionFailed,
  TankerError,
  TooManyAttempts,
  DeviceRevoked
} from '@tanker/errors';

import { Tanker, optionsWithDefaults } from './Tanker';
import { statuses } from './LocalUser/types';
import { fromBase64, toBase64, hashPassphrase } from './utils';

// export
export default Tanker;

export type { b64string } from '@tanker/crypto';
export type { OutputOptions, ProgressOptions, SharingOptions } from './DataProtection/options';
export type { EmailVerification, PassphraseVerification, KeyVerification, Verification, VerificationMethod } from './LocalUser/types';
export type { TankerOptions } from './Tanker';

const errors = {
  DecryptionFailed,
  DeviceRevoked,
  ExpiredVerification,
  GroupTooBig,
  InternalError,
  InvalidArgument,
  InvalidVerification,
  NetworkError,
  OperationCanceled,
  PreconditionFailed,
  TankerError,
  TooManyAttempts,
};

export {
  Tanker,
  errors,
  fromBase64,
  optionsWithDefaults,
  statuses,
  toBase64,
  hashPassphrase,
};
