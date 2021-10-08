import { utils } from '@tanker/crypto';

const base64Prefix = '__BASE64__';
const base64PrefixLength = base64Prefix.length;

const toString = Object.prototype.toString;

// Fallback method to test if value constructed in another parent frame (instanceof won't work)
// See Safari issue: https://github.com/feross/buffer/issues/166
const getType = (value: unknown): string => {
  if (value == null)
    return value === undefined ? 'Undefined' : 'Null';

  return toString.call(value).slice(8, -1);
};

function walk(value: any, fun: (v: any, type: string) => any) {
  const type = getType(value);

  switch (type) {
    case 'Object':
    {
      const result: Record<string, any> = { ...value };
      Object.keys(result).forEach(k => {
        result[k] = walk(result[k], fun);
      });
      return result;
    }
    case 'Array':
    {
      const result: Array<any> = [...value];
      result.forEach((el, k) => {
        result[k] = walk(el, fun);
      });
      return result;
    }
    default:
      return fun(value, type);
  }
}

export function serializeBinary(value: any) {
  return walk(value, (v: any, type: string) => {
    if (type === 'Uint8Array') {
      return base64Prefix + utils.toBase64(v);
    }

    return v;
  });
}

export function deserializeBinary(value: any) {
  return walk(value, (v: any, type: string) => {
    if (type === 'String') {
      if (v.slice(0, base64PrefixLength) === base64Prefix) {
        return utils.fromBase64(v.slice(base64PrefixLength));
      }
    }

    return v;
  });
}

// Note: "walk()" will also fix/cast Object and Array
export function fixObjects(value: any) {
  return walk(value, (v: any, type: string) => {
    if (type === 'Uint8Array' && !(v instanceof Uint8Array))
      return new Uint8Array(v);

    if (type === 'Array' && !(v instanceof Array))
      return new Array(v);

    return v;
  });
}

export function identity(value: any) {
  return value;
}
