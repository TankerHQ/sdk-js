// @flow
import { type b64string } from '@tanker/crypto';

import { InvalidArgument } from '../errors';

export type ShareWithOptions = { shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> };

const validateShareWithOptions = (value: ShareWithOptions): bool => {
  if (!value || typeof value !== 'object' || value instanceof Array)
    return false;

  const keysToCheck = ['shareWithGroups', 'shareWithUsers'];
  const keys = Object.keys(value).filter(key => keysToCheck.indexOf(key) !== -1);

  for (const key of keys) {
    if (!(value[key] instanceof Array))
      return false;
    if (value[key].some(el => typeof el !== 'string'))
      return false;
  }

  return true;
};

export const assertShareWithOptions = (value: ShareWithOptions, argName: string = 'options') => {
  if (!validateShareWithOptions(value)) {
    throw new InvalidArgument(argName, '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> }', value);
  }
};

export const isShareWithOptionsEmpty = (opts: ShareWithOptions) => {
  if (opts.shareWithGroups && opts.shareWithGroups.length > 0)
    return false;
  if (opts.shareWithUsers && opts.shareWithUsers.length > 0)
    return false;
  return true;
};
