// import
import {
  Conflict,
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
  UpgradeRequired,
} from '@tanker/errors';

import { Padding } from '@tanker/crypto';
import { Tanker, optionsWithDefaults } from './Tanker';
import { Status, statuses } from './Session/status';
import { fromBase64, toBase64, prehashPassword, prehashAndEncryptPassword } from './utils';

// export
export type { b64string } from '@tanker/crypto';
export type { EncryptionStream } from '@tanker/crypto';
export type { DecryptionStream } from '@tanker/crypto';
export type { ResourceMetadata, Data } from '@tanker/types';
export type { OutputOptions, FormatOptions, ProgressOptions, SharingOptions, EncryptionOptions } from './DataProtection/options';
export type {
  EmailVerification,
  PhoneNumberVerification,
  PassphraseVerification,
  OidcVerification,
  KeyVerification,
  PreverifiedEmailVerification,
  PreverifiedPhoneNumberVerification,
  PreverifiedOidcVerification,
  PreverifiedVerification,
  Verification,
  VerificationMethod,
  EmailVerificationMethod,
  PhoneNumberVerificationMethod,
  PassphraseVerificationMethod,
  OidcVerificationMethod,
  KeyVerificationMethod,
  PreverifiedEmailVerificationMethod,
  PreverifiedPhoneNumberVerificationMethod,
  VerificationOptions,
  ProvisionalVerificationMethod,
  LegacyEmailVerificationMethod,
} from './LocalUser/types';
export type { AttachResult } from './ProvisionalIdentity/types';
export type { TankerOptions, ProvisionalVerification } from './Tanker';
export type { EncryptionSession } from './DataProtection/EncryptionSession';
export type { UploadStream } from './CloudStorage/UploadStream';
export type { DownloadStream } from './CloudStorage/DownloadStream';

const errors = {
  Conflict,
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
  UpgradeRequired,
};

export {
  Tanker,
  errors,
  fromBase64,
  optionsWithDefaults,
  Status,
  statuses,
  toBase64,
  prehashPassword,
  prehashAndEncryptPassword,
  Padding,
};
