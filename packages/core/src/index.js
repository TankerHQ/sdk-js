// @flow

// import
import { createUserSecretB64 as createUserSecret } from '@tanker/crypto';

import { Tanker, TankerStatus, getResourceId, optionsWithDefaults } from './Tanker';
import * as errors from './errors';
import { fromBase64, toBase64, fromString, toString, getTankerVersion } from './utils';
import ChunkEncryptor from './DataProtection/ChunkEncryptor';
import { getEncryptionFormat } from './DataProtection/Encryptor';

// export
export default Tanker;

export type { b64string } from '@tanker/crypto';
export type { EncryptionOptions } from './DataProtection/EncryptionOptions';
export type { TankerOptions } from './Tanker';
export type { TankerInterface, EncryptionInterface } from './TankerInterface';

export {
  errors,
  getTankerVersion,
  optionsWithDefaults,
  Tanker,
  TankerStatus,
  createUserSecret,
  fromBase64,
  fromString,
  getResourceId,
  getEncryptionFormat,
  toBase64,
  toString,
  ChunkEncryptor,
};
