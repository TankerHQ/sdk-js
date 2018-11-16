// @flow
import { type ShareWithOptions, validateShareWithOptions } from './ShareWithOptions';

export type EncryptionOptions = ShareWithOptions & { shareWithSelf?: bool };

export const validateEncryptionOptions = (value: any): bool => {
  if (typeof value === 'undefined')
    return true;

  if (typeof value !== 'object' || value === null)
    return false;

  if (value.shareWith) {
    console.warn('The shareWith option is deprecated, use { shareWithUsers: [], shareWithGroups: [] } format instead');
    if (value.shareWithUsers || value.shareWithGroups) {
      return false;
    }
  }

  const { shareWithSelf, ...shareWithOptions } = value;

  return validateShareWithOptions(shareWithOptions);
};
