// @flow
import { type ShareWithOptions, validateShareWithOptions } from './ShareWithOptions';

export type EncryptionOptions = ShareWithOptions;

export const validateEncryptionOptions = (value: any): bool => {
  if (typeof value === 'undefined')
    return true;

  if (typeof value !== 'object' || value === null)
    return false;

  return validateShareWithOptions(value);
};
