const getConstructorName = (obj: Record<string, any>) => {
  const constructor = obj.constructor;
  if (typeof constructor !== 'function') { // e.g. 'undefined' for obj = Object.create(null)
    return 'Object';
  }
  return constructor.name;
};

const hasLength = (value: { length?: unknown }): value is { length: number } => 'length' in value && typeof value.length === 'number';

export const safePrintType = (value: unknown) => {
  try {
    if (value === null)
      return 'null';

    if (typeof value === 'object') {
      const constructorName = getConstructorName(value);
      if (hasLength(value))
        return `${constructorName}(${value.length})`;
      return constructorName;
    }

    return typeof value;
  } catch (err) {
    console.error(err);
    return '[error printing type]';
  }
};

// Note: not recursive for now
export const safePrintValue = (value: unknown, maxLength: number = 100) => {
  try {
    if (value === undefined)
      return 'undefined';
    if (value === null)
      return 'null';
    if (typeof value === 'object') {
      if (hasLength(value) && value.length > maxLength)
        return '[too big to print]';
    }
    if (value !== value) // eslint-disable-line no-self-compare
      return 'NaN';
    if (typeof value === 'function')
      return '[source code]';

    try {
      return JSON.stringify(value);
    } catch (err) {
      return `${value}`;
    }
  } catch (err) {
    console.error(err);
    return '[error printing value]';
  }
};
