// @flow
export type ShareWithOptions = Array<string> | { users?: Array<string>, groups?: Array<string> };

export const validateShareWithOptions = (value: any): bool => {
  if (typeof value !== 'object' || value === null)
    return false;

  if (value instanceof Array)
    return value.every(el => typeof el === 'string');

  const keys = Object.keys(value);

  for (const key of keys) {
    if (key === 'groups' || key === 'users') {
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

export const isShareWithOptionsEmpty = (shareWith: ShareWithOptions) => {
  if (shareWith instanceof Array)
    return shareWith.length === 0;
  if (shareWith.groups && shareWith.groups.length > 0)
    return false;
  if (shareWith.users && shareWith.users.length > 0)
    return false;
  return true;
};
