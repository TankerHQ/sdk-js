// @flow

// import
import { Tanker, optionsWithDefaults } from './Tanker';
import * as errors from './errors';
import { statuses } from './Session/types';
import { fromBase64, toBase64, fromString, toString } from './utils';
import { getEncryptionFormat } from './DataProtection/Encryptor';
import { assertShareWithOptions } from './DataProtection/ShareWithOptions';


// export
export default Tanker;

export type { b64string } from '@tanker/crypto';
export type { ShareWithOptions } from './DataProtection/ShareWithOptions';
export type { Verification, VerificationMethod } from './Session/types';
export type { TankerOptions } from './Tanker';
export type { TankerInterface, EncryptionInterface } from './TankerInterface';

export {
  Tanker,
  assertShareWithOptions,
  errors,
  fromBase64,
  fromString,
  getEncryptionFormat,
  optionsWithDefaults,
  statuses,
  toBase64,
  toString,
};
