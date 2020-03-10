// @flow

// Use a RegExp since IE11 does not implement Function.prototype.name
const constructorNameRegExp = /^.*(?:function|class) +([^( ]+).*$/;

const getConstructorName = (obj: Object) => {
  const constructor = obj.constructor;

  if (typeof constructor !== 'function') // e.g. 'undefined' for obj = Object.create(null)
    return 'Object';

  if (typeof constructor.name === 'string')
    return constructor.name;

  return constructor.toString().trim().split('\n')[0].replace(constructorNameRegExp, '$1');
};

export const safePrintType = (value: any) => {
  try {
    if (value === null)
      return 'null';

    if (typeof value === 'object') {
      const constructorName = getConstructorName(value);
      if ('length' in value)
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
export const safePrintValue = (value: any, maxLength: number = 100) => {
  try {
    if (value === undefined)
      return 'undefined';
    if (value === null)
      return 'null';
    if (typeof value === 'object') {
      if ('length' in value && value.length > maxLength)
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
