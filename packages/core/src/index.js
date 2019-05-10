// @flow

// import
import { Tanker, optionsWithDefaults } from './Tanker';
import * as errors from './errors';
import { statuses } from './Session/types';
import { fromBase64, toBase64, fromString, toString } from './utils';
import { getEncryptionFormat } from './DataProtection/Encryptor';

// export
export default Tanker;

export type { b64string } from '@tanker/crypto';
export type { EncryptionOptions } from './DataProtection/EncryptionOptions';
export type { VerificationMethod } from './Session/types';
export type { TankerOptions } from './Tanker';
export type { TankerInterface, EncryptionInterface } from './TankerInterface';

export {
  errors,
  optionsWithDefaults,
  statuses,
  Tanker,
  fromBase64,
  fromString,
  getEncryptionFormat,
  toBase64,
  toString,
};
