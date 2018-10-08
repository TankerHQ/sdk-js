// @flow
import { utils } from '@tanker/crypto';

const base64Prefix = '__BASE64__';
const base64PrefixLength = base64Prefix.length;

function _isOrCast(value: any, constructor: any, mode: string = 'is') { // eslint-disable-line no-underscore-dangle
  // Normal check
  if (value instanceof constructor) {
    return mode === 'cast' ? value : true;
  }

  const { name } = constructor;

  // Check if value constructed in another parent frame
  // See Safari issue: https://github.com/feross/buffer/issues/166
  if (typeof window !== 'undefined') {
    let w = window;
    while (w && w.parent && w.parent !== w) {
      w = w.parent;
      // Verify that w[name] is a constructor that can be used with instanceof
      if (w[name] && w[name].prototype && value instanceof w[name]) {
        return mode === 'cast' ? new constructor(value) : true;
      }
    }
  }

  if (mode === 'cast')
    throw new Error(`Unexpectedly trying to cast value into ${name}`);

  return false;
}

function instanceOf(value: any, constructor: any) {
  return _isOrCast(value, constructor, 'is');
}

function cast(value: any, constructor: any) {
  return _isOrCast(value, constructor, 'cast');
}

function getTypeAsString(value: any) {
  if (instanceOf(value, Uint8Array)) return 'uint8';
  if (instanceOf(value, Array)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function walk(value: any, fun: Function) {
  let result;
  const type = getTypeAsString(value);

  switch (type) {
    case 'object':
      result = { ...value };
      Object.keys(result).forEach(k => {
        result[k] = walk(result[k], fun);
      });
      break;
    case 'array':
      result = [...value];
      result.forEach((el, k) => {
        result[k] = walk(el, fun);
      });
      break;
    default:
      result = fun(value, type);
  }

  return result;
}

export function serializeBinary(value: any) {
  return walk(value, (v: any, type: any) => {
    if (type === 'uint8') {
      return base64Prefix + utils.toBase64(v);
    }
    return v;
  });
}

export function deserializeBinary(value: any) {
  return walk(value, (v: any, type: any) => {
    if (type === 'string') {
      if (v.slice(0, base64PrefixLength) === base64Prefix) {
        return utils.fromBase64(v.slice(base64PrefixLength));
      }
    }
    return v;
  });
}

// Note: "walk()" will also fix/cast Object and Array
export function fixObjects(value: any) {
  return walk(value, (v: any, type: any) => {
    if (type === 'uint8') {
      return cast(v, Uint8Array);
    }
    return v;
  });
}

export function identity(value: any) {
  return value;
}
