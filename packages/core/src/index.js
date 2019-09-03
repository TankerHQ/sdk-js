// @flow

// import
import { Tanker, optionsWithDefaults } from './Tanker';
import * as errors from './errors';
import { statuses } from './Session/types';
import { fromBase64, toBase64 } from './utils';

// export
export default Tanker;

export type { b64string } from '@tanker/crypto';
export type { OutputOptions, ProgressOptions, SharingOptions } from './DataProtection/options';
export type { EmailVerification, PassphraseVerification, KeyVerification, Verification, VerificationMethod } from './Session/types';
export type { TankerOptions } from './Tanker';

export {
  Tanker,
  errors,
  fromBase64,
  optionsWithDefaults,
  statuses,
  toBase64,
};
