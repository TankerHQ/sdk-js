// @flow
export type ShareWithOptions = Array<string> | { shareWithUsers?: Array<string>, shareWithGroups?: Array<string> };

export const validateShareWithOptions = (value: any): bool => {
  if (typeof value !== 'object' || value === null)
    return false;

  if (value instanceof Array) {
    console.warn('The shareWith option as an array is deprecated, use { shareWithUsers: [], shareWithGroups: [] } format instead');
    return value.every(el => typeof el === 'string');
  }

  const keys = Object.keys(value);

  for (const key of keys) {
    if (key === 'shareWithGroups' || key === 'shareWithUsers') {
      if (!(value[key] instanceof Array))
        return false;
      if (value[key].some(el => typeof el !== 'string'))
        return false;
    } else {
      // unexpected key
      return false;
    }
  }

  return true;
};
