/* eslint-disable no-bitwise */
import sodium from 'libsodium-wrappers';
import { InvalidArgument } from '@tanker/errors';
import { assertNotEmptyString } from '@tanker/types';

import type { b64string, safeb64string } from './aliases';
import { generichash } from './hash';

function assertArrayTypes(a: Uint8Array, b: Uint8Array) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
    const typea = a instanceof Uint8Array ? 'Uint8Array' : typeof a;
    const typeb = b instanceof Uint8Array ? 'Uint8Array' : typeof b;
    throw new TypeError(`Expected two Uint8Arrays, got ${typea} and ${typeb}`);
  }
}

function uint6ToB64(uint6: number) {
  if (uint6 < 26)
    return uint6 + 65;
  if (uint6 < 52)
    return uint6 + 71;
  if (uint6 < 62)
    return uint6 - 4;
  if (uint6 === 62)
    return 43;
  if (uint6 === 63)
    return 47;
  return 65;
}

export function toBase64(bytes: Uint8Array): b64string {
  if (!(bytes instanceof Uint8Array))
    throw new TypeError('"bytes" is not a Uint8Array');

  // Each triplet of bytes from the source (i.e. an uint24 value) is eventually
  // converted to 4 base64 char codes (i.e. 4 bytes). We're buffering them to
  // reduce the number of calls to the slow `String.fromCharCode` method.
  const byteLength = bytes.length;
  const paddingLength = (3 - byteLength % 3) % 3;
  const resultLength = (byteLength + paddingLength) * 4 / 3;
  const bufferMaxLength = 1000; // must be a multiple of 4
  const bufferLength = Math.min(bufferMaxLength, resultLength);
  const buffer = new Uint8Array(bufferLength);

  let result = '';
  let mod3 = 2;
  let uint24 = 0;
  let bufferIndex = 0;

  for (let byteIndex = 0; byteIndex < byteLength; byteIndex++) {
    mod3 = byteIndex % 3;

    uint24 |= bytes[byteIndex]! << (16 >>> mod3 & 24);

    if (mod3 === 2 || byteLength - byteIndex === 1) {
      buffer[bufferIndex] = uint6ToB64(uint24 >>> 18 & 63);
      buffer[bufferIndex + 1] = uint6ToB64(uint24 >>> 12 & 63);
      buffer[bufferIndex + 2] = uint6ToB64(uint24 >>> 6 & 63);
      buffer[bufferIndex + 3] = uint6ToB64(uint24 & 63);
      bufferIndex += 4;
      uint24 = 0;

      if (bufferIndex === bufferLength || byteLength - byteIndex === 1) {
        // @ts-expect-error typescript uses the wrong overload
        result += String.fromCharCode.apply(null, buffer.subarray(0, bufferIndex));
        bufferIndex = 0;
      }
    }
  }
  return result.substr(0, result.length - 2 + mod3) + ['==', '=', ''][mod3];
}

const rfc4648Base64RegExp = /^[A-Za-z0-9+/]*={0,2}$/;
const ignoredCharRegExp = /[^A-Za-z0-9+/]+/g;

export function fromBase64(str: b64string): Uint8Array {
  if (typeof str !== 'string')
    throw new TypeError('"str" is not a string');

  if (!str.match(rfc4648Base64RegExp)) {
    console.warn(`deprecated base64 format: ${new TypeError('"str" is not a valid base64 string according to RFC 4648').message}`);
  }

  const strNoPadding = str.replace(ignoredCharRegExp, '');
  const inLen = strNoPadding.length;
  const outLen = inLen * 3 + 1 >> 2;
  const output = new Uint8Array(outLen);

  for (let charCode, mod3, mod4, uint6, uint24 = 0, outIndex = 0, inIndex = 0; inIndex < inLen; inIndex++) {
    mod4 = inIndex & 3;
    charCode = strNoPadding.charCodeAt(inIndex);

    // After switching to ES2019, we noticed a drop in performance on Safari.
    // Inlining this code (previously in a separate function) improves the performance, even in ES5.
    if (charCode > 64 && charCode < 91) {
      uint6 = charCode - 65;
    } else if (charCode > 96 && charCode < 123) {
      uint6 = charCode - 71;
    } else if (charCode > 47 && charCode < 58) {
      uint6 = charCode + 4;
    } else if (charCode === 43) {
      uint6 = 62;
    } else if (charCode === 47) {
      uint6 = 63;
    } else {
      uint6 = 0;
    }

    uint24 |= uint6 << 18 - 6 * mod4;

    if (mod4 === 3 || inLen - inIndex === 1) {
      for (mod3 = 0; mod3 < 3 && outIndex < outLen; mod3 += 1, outIndex += 1) {
        output[outIndex] = uint24 >>> (16 >>> mod3 & 24) & 255;
      }

      uint24 = 0;
    }
  }

  return output;
}

// Note: use /[=/+]/g regex to strip padding, /[/+]/g otherwise
function base64ToUrlsafeReplacer(char: string) {
  if (char === '/') return '_';
  if (char === '+') return '-';
  return '';
}

// Base 64 encoding with URL and Filename Safe Alphabet
// See: https://tools.ietf.org/html/rfc4648#page-7
export function toSafeBase64(bytes: Uint8Array): safeb64string {
  if (!(bytes instanceof Uint8Array))
    throw new TypeError('"bytes" is not a Uint8Array');

  return toBase64(bytes).replace(/[/+]/g, base64ToUrlsafeReplacer);
}

export function toRawUrlBase64(bytes: Uint8Array): safeb64string {
  return toSafeBase64(bytes).replace(/=/g, () => '');
}

function base64FromUrlsafeReplacer(char: string) {
  if (char === '_') return '/';
  if (char === '-') return '+';
  return '';
}

export function fromSafeBase64(str: safeb64string): Uint8Array {
  if (typeof str !== 'string')
    throw new TypeError('"str" is not a string');

  return fromBase64(str.replace(/[-_]/g, base64FromUrlsafeReplacer));
}

export function fromRawUrlBase64(str: safeb64string): Uint8Array {
  if (typeof str !== 'string')
    throw new TypeError('"str" is not a string');

  if (str.indexOf('=') !== -1)
    throw new TypeError('"str" is not a unpadded base64');

  return fromBase64(str.replace(/[-_]/g, base64FromUrlsafeReplacer));
}

const generateB64WithSizeAssertion = (codec: (arg: string) => Uint8Array) => (arg: unknown, argName: string, expectedSize: number) => {
  assertNotEmptyString(arg, argName);

  let unb64;

  try {
    unb64 = codec(arg);
  } catch (e) {
    throw new InvalidArgument(argName, `${argName} is not valid base64`, arg);
  }

  if (unb64.length !== expectedSize) {
    throw new InvalidArgument(argName, `${argName} is not the right size, expected ${expectedSize}, got ${unb64.length}`, arg);
  }
};

export type B64Assertion = (arg: unknown, argName: string, expectedSize: number) => asserts arg is string;

export const assertB64StringWithSize: B64Assertion = generateB64WithSizeAssertion(fromBase64);

export const assertRawUrlB64StringWithSize: B64Assertion = generateB64WithSizeAssertion(fromRawUrlBase64);

export function toString(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array))
    throw new TypeError('"bytes" is not a Uint8Array');

  return sodium.to_string(bytes);
}

export function fromString(str: string): Uint8Array {
  if (typeof str !== 'string')
    throw new TypeError('"str" is not a string');

  return sodium.from_string(str);
}

export function fromB64Json(str: b64string): Record<string, any> {
  return JSON.parse(toString(fromBase64(str)));
}

export function toB64Json(o: Record<string, any>): b64string {
  return toBase64(fromString(JSON.stringify(o)));
}

export function concatArrays(...arrays: Array<Uint8Array>): Uint8Array {
  const totalSize = arrays.reduce((acc, elem) => acc + elem.length, 0);

  const ret = new Uint8Array(totalSize);
  let offset = 0;
  arrays.forEach(elem => {
    if (elem instanceof Uint8Array)
      ret.set(elem, offset);
    else
      throw new TypeError(`Expected Uint8Array, got ${typeof elem}`);

    offset += elem.length;
  });
  return ret;
}

export function equalArray(b1: Uint8Array, b2: Uint8Array): boolean {
  assertArrayTypes(b1, b2);

  if (b1.length !== b2.length)
    return false;

  for (let i = 0; i < b1.length; i++)
    if (b1[i] !== b2[i])
      return false;

  return true;
}

export function containArray(b1: Array<Uint8Array>, b2: Uint8Array) {
  for (const b of b1) {
    if (equalArray(b, b2)) {
      return true;
    }
  }

  return false;
}

export function isNullArray(bytes: Uint8Array): boolean {
  if (!(bytes instanceof Uint8Array))
    throw new TypeError('"bytes" is not a Uint8Array');

  return sodium.is_zero(bytes);
}

export function memzero(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array))
    throw new TypeError('"bytes" is not a Uint8Array');

  sodium.memzero(bytes);
}

export function generateAppID(publicKey: Uint8Array): Uint8Array {
  return generichash(concatArrays(new Uint8Array([1]), new Uint8Array(32), publicKey));
}

// Function exposed for our users using the verification by passphrase to hash their password client side.
// This hash must be different from the hash we use internally, thus we add a pepper.
export function prehashPassword(data: Uint8Array): Uint8Array {
  if (!data || !data.length) {
    throw new InvalidArgument('Cannot hash an empty password');
  }

  const pepper = fromString('2NsxLuBPL7JanD2SIjb9erBgVHjMFh');
  return generichash(concatArrays(data, pepper));
}

// This function is NOT exposed to our users. It is important that others prehash passwords differently than we do,
// otherwise when the password is the same, both parties would know the value that the other accepts as password hash.
// The 'nothing up my sleeve' pepper constant provides confidence it wasn't picked to match a value that might be
// already in use elsewhere (whether accidentally or maliciously).
export function prehashE2eVerificationPassphrase(data: Uint8Array): Uint8Array {
  if (!data || !data.length) {
    throw new InvalidArgument('Cannot hash an empty e2e passphrase');
  }

  const pepper = fromString('tanker e2e verification passphrase pepper');
  return generichash(concatArrays(data, pepper));
}

// This function is NOT exposed to our users. The key returned by this function is used directly for encryption,
// so it is important that we never send this hash value to anyone. We use a 'nothing up my sleeve' pepper for this.
export function e2ePassphraseKeyDerivation(data: Uint8Array): Uint8Array {
  if (!data || !data.length) {
    throw new InvalidArgument('Cannot do key derivation from an empty e2e passphrase');
  }

  const pepper = fromString('tanker e2e passphrase key derivation pepper');
  return generichash(concatArrays(data, pepper));
}
