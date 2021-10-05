import { utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

const isObject = (val: unknown): val is Record<string, any> => !!val && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype;

export function b64RequestObject(requestObject: any): any {
  if (requestObject instanceof Uint8Array) {
    return utils.toBase64(requestObject);
  }

  if (Array.isArray(requestObject)) {
    return requestObject.map(elem => b64RequestObject(elem));
  }

  if (!isObject(requestObject))
    throw new InternalError('Assertion error: b64RequestObject operates only on Object, Array and Uint8Array instances');

  const result: Record<string, any> = {};

  Object.keys(requestObject).forEach(key => {
    const value = requestObject[key];
    if (value instanceof Uint8Array) {
      result[key] = utils.toBase64(value);
    } else if (Array.isArray(value)) {
      result[key] = b64RequestObject(value);
    } else if (isObject(value)) {
      result[key] = b64RequestObject(value);
    } else {
      result[key] = value;
    }
  });

  return result;
}

export function urlize(value: string | Uint8Array) {
  if (value && value instanceof Uint8Array) {
    return utils.toSafeBase64(value).replace(/=+$/g, '');
  }
  if (typeof value === 'string') {
    return encodeURIComponent(value);
  }
  throw new InternalError('Assertion error: urlize operates only on strings and Uint8Array instances');
}
