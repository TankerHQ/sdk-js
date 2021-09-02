export function makeSortFunction(key: string, direction: 'asc' | 'desc') {
  const [smaller, equal, bigger] = { asc: [-1, 0, 1], desc: [1, 0, -1] }[direction];

  return (a: Record<string, any>, b: Record<string, any>): -1 | 0 | 1 => {
    if (a[key] < b[key])
      return smaller;
    if (a[key] > b[key])
      return bigger;
    return equal;
  };
}
