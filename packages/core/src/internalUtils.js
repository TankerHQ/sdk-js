// @flow

export function flat<T>(a: Array<Array<T>>): Array<T> {
  // equivalent of
  //   return a.reduce((acc, val) => acc.concat(val), []);
  // but with less memory allocations

  let len = a.reduce((acc, val) => acc + val.length, 0);
  const res = new Array(len);
  for (let i = a.length - 1; i >= 0; --i) {
    const sub = a[i];
    for (let j = sub.length - 1; j >= 0; --j) {
      len -= 1;
      res[len] = sub[j];
    }
  }
  return res;
}
