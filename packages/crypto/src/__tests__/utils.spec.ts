import { expect } from '@tanker/test-utils';

import { InvalidArgument } from '@tanker/errors';
import sodium from 'libsodium-wrappers';
import { ready } from '../ready';
import type { b64string, safeb64string } from '../aliases';
import { concatArrays, equalArray, isNullArray, memzero, fromB64Json, fromBase64, fromSafeBase64, toB64Json, toBase64, toSafeBase64, fromString, toString, prehashPassword } from '../utils';
import { generichash } from '../hash';

describe('utils', () => {
  let base64: b64string;
  let bytes: Uint8Array;
  let noPaddingBase64: b64string;
  let noPaddingUrlSafeBase64: safeb64string;
  let str: string;
  let urlSafeBase64: safeb64string;
  let rfc2045Base64: b64string;

  before(async () => {
    await ready;

    str = '\u{1F680} Tanker rocks!!!';
    bytes = new Uint8Array([240, 159, 154, 128, 32, 84, 97, 110, 107, 101, 114, 32, 114, 111, 99, 107, 115, 33, 33, 33]);
    base64 = '8J+agCBUYW5rZXIgcm9ja3MhISE=';
    noPaddingBase64 = '8J+agCBUYW5rZXIgcm9ja3MhISE';
    noPaddingUrlSafeBase64 = '8J-agCBUYW5rZXIgcm9ja3MhISE';
    urlSafeBase64 = '8J-agCBUYW5rZXIgcm9ja3MhISE=';
    rfc2045Base64 = '8J+a\ngCB  UYW\t5rZX😭Igcm9éja3M hISE=\n';
  });

  describe('utf-16 string (DOM String) <-> utf-8 binary representation (Uint8Array)', () => {
    it('can convert a utf-16 encoded string to bytes representing a utf-8 string', () => {
      expect(fromString(str)).to.deep.equal(bytes);
    });

    it('can convert bytes representing a utf-8 string into a utf-16 encoded string', () => {
      expect(toString(bytes)).to.equal(str);
    });
  });

  describe('bytes <-> base64', () => {
    it('can convert bytes to a base64 string', () => {
      expect(toBase64(bytes)).to.equal(base64);
    });

    it('can convert huge byte arrays to a base64 string', () => {
      const arrayLength = 1500;
      const byteArray = new Uint8Array(arrayLength);

      for (let index = 0; index < arrayLength; index++) {
        byteArray[index] = index % 256;
      }

      const expected = sodium.to_base64(byteArray, sodium.base64_variants.ORIGINAL);
      expect(toBase64(byteArray)).to.equal(expected);
    });

    it('can convert a base64 string to bytes', () => {
      expect(fromBase64(base64)).to.deep.equal(bytes);
    });

    it('can convert a base64 string following rfc-2045 to bytes', () => {
      expect(fromBase64(rfc2045Base64)).to.deep.equal(bytes);
    });

    it('can convert bytes to a URL-safe base64 string', () => {
      expect(toSafeBase64(bytes)).to.equal(urlSafeBase64);
    });

    it('can convert a URL-safe base64 string to bytes', () => {
      expect(fromSafeBase64(urlSafeBase64)).to.deep.equal(bytes);
    });

    it('can convert a regular base64 string to bytes', () => {
      expect(fromSafeBase64(base64)).to.deep.equal(bytes);
    });

    it('can convert a non-padded regular base64 string to bytes', () => {
      expect(fromSafeBase64(noPaddingBase64)).to.deep.equal(bytes);
    });

    it('can convert a non-padded URL-safe base64 string to bytes', () => {
      expect(fromSafeBase64(noPaddingUrlSafeBase64)).to.deep.equal(bytes);
    });
  });

  describe('RFC 4648 test vectors', () => {
    const bytes4648 = [
      new Uint8Array([]),
      new Uint8Array([102]),
      new Uint8Array([102, 111]),
      new Uint8Array([102, 111, 111]),
      new Uint8Array([102, 111, 111, 98]),
      new Uint8Array([102, 111, 111, 98, 97]),
      new Uint8Array([102, 111, 111, 98, 97, 114]),
    ];

    const str4648 = [
      '',
      'Zg==',
      'Zm8=',
      'Zm9v',
      'Zm9vYg==',
      'Zm9vYmE=',
      'Zm9vYmFy',
    ];

    it('can convert RFC 4648 test vectors fromBase64', () => {
      for (let i = 0; i < str4648.length; i++) {
        expect(fromBase64(str4648[i]!)).to.deep.equal(bytes4648[i]);
      }
    });

    it('can convert RFC 4648 test vectors toBase64', () => {
      for (let i = 0; i < bytes4648.length; i++) {
        expect(toBase64(bytes4648[i]!)).to.deep.equal(str4648[i]);
      }
    });
  });

  describe('json base64', () => {
    let obj: { base64: b64string, str: string };
    let objAsJsonB64: b64string;

    before(() => {
      obj = { base64, str };
      objAsJsonB64 = 'eyJiYXNlNjQiOiI4SithZ0NCVVlXNXJaWElnY205amEzTWhJU0U9Iiwic3RyIjoi8J+agCBUYW5rZXIgcm9ja3MhISEifQ==';
    });

    it('can serialize an object to json base64', () => {
      expect(toB64Json(obj)).to.equal(objAsJsonB64);
    });

    it('can deserialize an object from json base64', () => {
      const objDeserialized = fromB64Json(objAsJsonB64);
      expect(objDeserialized).to.deep.equal(obj);
    });
  });

  describe('binary helpers', () => {
    it('can concat binary arrays', () => {
      const hello = new Uint8Array([104, 101, 108, 108, 111]);
      const world = new Uint8Array([119, 111, 114, 108, 100]);
      const helloWorld = new Uint8Array([104, 101, 108, 108, 111, 119, 111, 114, 108, 100]);
      expect(concatArrays(hello, world)).to.deep.equal(helloWorld);
    });

    it('can check if binary array contains only zeros', () => {
      expect(isNullArray(new Uint8Array([0, 0, 0]))).to.be.true;
      expect(isNullArray(new Uint8Array([0, 255, 0]))).to.be.false;
    });

    it('can mem zero a binary array in place', () => {
      const array = new Uint8Array([42, 0]);
      memzero(array);
      expect(isNullArray(array)).to.be.true;
    });

    it('can test equality of binary arrays', () => {
      const array = new Uint8Array([42, 255, 0]);
      const same = new Uint8Array([42, 255, 0]);
      const others = [new Uint8Array([41, 255, 0]), new Uint8Array([42, 255]), new Uint8Array([42, 255, 0, 0])];
      expect(equalArray(array, array)).to.be.true;
      expect(equalArray(array, same)).to.be.true;
      others.forEach((other, i) => expect(equalArray(array, other), `#${i}`).to.be.false);
    });
  });

  describe('wrong argument type', () => {
    it('throws TypeError if not given an Uint8Array', () => {
      [concatArrays, equalArray, isNullArray, memzero, toBase64, toSafeBase64, toString].forEach((helper, i) => {
        // @ts-expect-error
        expect(() => { helper(str); }, `bad argument #${i}`).to.throw(TypeError);
      });
    });

    it('throws TypeError if not given a string', () => {
      [fromB64Json, fromBase64, fromSafeBase64, fromString].forEach((helper, i) => {
        // @ts-expect-error
        expect(() => { helper(bytes); }, `bad argument #${i}`).to.throw(TypeError);
      });
    });
  });

  describe('prehashPassword', () => {
    it('should be a different hash function than the one we use', () => {
      const input = 'super secretive password';
      const output = toBase64(prehashPassword(fromString(input)));
      const ourHash = toBase64(generichash(fromString(input)));

      expect(output).to.not.deep.equal(ourHash);
    });

    it('should be equal to the test vector', () => {
      const input = 'super secretive password';
      const output = toBase64(prehashPassword(fromString(input)));
      const b64TestVector = 'UYNRgDLSClFWKsJ7dl9uPJjhpIoEzadksv/Mf44gSHI=';

      expect(output).to.deep.equal(b64TestVector);
    });

    it('should be equal to the unicode test vector', () => {
      const input = 'test éå 한국어 😃';
      const output = toBase64(prehashPassword(fromString(input)));
      const b64TestVector = 'Pkn/pjub2uwkBDpt2HUieWOXP5xLn0Zlen16ID4C7jI=';

      expect(output).to.deep.equal(b64TestVector);
    });

    it('should throw when given an empty password', () => {
      expect(() => { prehashPassword(fromString('')); }).to.throw(InvalidArgument);
    });
  });
});
