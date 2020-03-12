// @flow

// Because IE11: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex#Browser_compatibility
export function findIndex<T>(array: Array<T>, predicate: T => bool): number {
  if (Array.prototype.findIndex)
    return array.findIndex(predicate);

  for (let i = 0; i < array.length; ++i) // eslint-disable-line no-plusplus
    if (predicate(array[i]))
      return i;

  return -1;
}

export function makeSortFunction(key: string, direction: 'asc' | 'desc') {
  const [smaller, equal, bigger] = { asc: [-1, 0, 1], desc: [1, 0, -1] }[direction];

  return (a: Object, b: Object): -1 | 0 | 1 => {
    if (a[key] < b[key])
      return smaller;
    if (a[key] > b[key])
      return bigger;
    return equal;
  };
}
