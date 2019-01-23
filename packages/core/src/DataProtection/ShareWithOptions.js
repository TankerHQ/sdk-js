// @flow
export type ShareWithOptions = { shareWith?: Array<string>, shareWithUsers?: Array<string>, shareWithGroups?: Array<string> };

export const validateShareWithOptions = (value: any): bool => {
  if (typeof value !== 'object' || value === null)
    return false;

  const keys = Object.keys(value);

  for (const key of keys) {
    if (key === 'shareWith' || key === 'shareWithGroups' || key === 'shareWithUsers') {
      if (!(value[key] instanceof Array))
        return false;
      if (value[key].some(el => typeof el !== 'string'))
        return false;
      if (key === 'shareWith' && keys.length > 1)
        return false;
    }
  }

  return true;
};

export const isShareWithOptionsEmpty = (opts: ShareWithOptions) => {
  if (opts.shareWith)
    return opts.shareWith.length === 0;
  if (opts.shareWithGroups && opts.shareWithGroups.length > 0)
    return false;
  if (opts.shareWithUsers && opts.shareWithUsers.length > 0)
    return false;
  return true;
};
