// @flow

// import
import { Tanker, optionsWithDefaults } from './Tanker';
import * as errors from './errors';
import { fromBase64, toBase64, fromString, toString } from './utils';
import { getEncryptionFormat } from './DataProtection/Encryptor';
import { SIGN_IN_RESULT } from './Session/SessionOpener';

// export
export default Tanker;

export type { b64string } from '@tanker/crypto';
export type { EncryptionOptions } from './DataProtection/EncryptionOptions';
export type { TankerOptions } from './Tanker';
export type { TankerInterface, EncryptionInterface } from './TankerInterface';

export {
  errors,
  optionsWithDefaults,
  Tanker,
  fromBase64,
  fromString,
  getEncryptionFormat,
  toBase64,
  toString,
  SIGN_IN_RESULT,
};
