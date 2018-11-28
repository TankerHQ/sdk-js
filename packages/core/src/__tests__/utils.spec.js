// @flow
import { utils } from '@tanker/crypto';

import { expect } from './chai';
import { toBase64, fromBase64, toString, fromString, findIndex, getTankerVersion, compareSameSizeUint8Arrays } from '../utils';
import { errors } from '../index';

const notStringTypes = [undefined, null, 0, {}, [], new Uint8Array(0)];
const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'wat'];

describe('utils', () => {
  describe('utils.toBase64/utils.fromBase64', () => {
    const b64Str = 'bmV2ZXIgZ29ubmEgZ2l2ZSB5b3UgdXAK';
    const buffer = new Uint8Array([0x6e, 0x65, 0x76, 0x65, 0x72, 0x20, 0x67, 0x6f, 0x6e, 0x6e, 0x61, 0x20, 0x67, 0x69, 0x76, 0x65, 0x20, 0x79, 0x6f, 0x75, 0x20, 0x75, 0x70, 0x0a]);

    it('should convert a string from base64', () => {
      expect(utils.equalArray(fromBase64(b64Str), buffer)).to.be.true;
    });

    it('should convert a buffer to base64', () => {
      expect(toBase64(buffer)).to.equal(b64Str);
    });

    it('should convert a string from base64 and back', () => {
      expect(toBase64(fromBase64(b64Str))).to.equal(b64Str);
    });

    it('should throw when toBase64 is given an invalid type', async () => {
      // $FlowExpectedError
      notUint8ArrayTypes.forEach((v, i) => expect(() => toBase64(v), `#${i}`).to.throw(errors.InvalidArgument));
    });

    it('should throw when fromBase64 is given an invalid type', async () => {
      // $FlowExpectedError
      notStringTypes.forEach((v, i) => expect(() => fromBase64(v), `#${i}`).to.throw(errors.InvalidArgument));
    });
  });

  describe('utils.toString/utils.fromString', () => {
    const str = 'str';
    const buffer = new Uint8Array([0x73, 0x74, 0x72]);

    it('should convert a string to a buffer', () => {
      expect(utils.equalArray(fromString(str), buffer)).to.be.true;
    });

    it('should convert a buffer to a string', () => {
      expect(toString(buffer)).to.equal(str);
    });

    it('should convert from a string and back', () => {
      expect(toString(fromString(str))).to.equal(str);
    });

    it('should throw when toString is given an invalid type', () => {
      // $FlowExpectedError
      notUint8ArrayTypes.forEach((v, i) => expect(() => toString(v), `#${i}`).to.throw(errors.InvalidArgument));
    });

    it('should throw when fromString is given an invalid type', async () => {
      // $FlowExpectedError
      notStringTypes.forEach((v, i) => expect(() => fromString(v), `#${i}`).to.throw(errors.InvalidArgument));
    });
  });

  describe('utils.findIndex', () => {
    it('should find the first element matching the predicate function', () => {
      expect(findIndex([0, 1, 2, 3, 4], (el) => el > 1)).to.equal(2);
      expect(findIndex(['a', 'b', 'c'], (el) => el === 'b')).to.equal(1);
      expect(findIndex([1, 3, 5, 7, 9], (el) => el % 2 === 0)).to.equal(-1);
    });
  });

  describe('get tanker version', () => {
    it('should look like a version', () => {
      expect(typeof getTankerVersion()).to.equal('string');
    });
  });

  describe('compare uint arrays', () => {
    it('should throw when array does not have the same size', () => {
      expect(() => compareSameSizeUint8Arrays(new Uint8Array(1), new Uint8Array(2))).to.throw();
    });
    it('should return 0 when arrays match', () => {
      const left = new Uint8Array([45]);
      const right = new Uint8Array([45]);
      expect(compareSameSizeUint8Arrays(left, right)).to.equal(0);
    });
    it('should return 1 when left > right', () => {
      const left = new Uint8Array([4, 46]);
      const right = new Uint8Array([4, 45]);
      expect(compareSameSizeUint8Arrays(left, right)).to.equal(1);
    });
    it('should return -1 when left < right', () => {
      const left = new Uint8Array([4, 45]);
      const right = new Uint8Array([4, 46]);
      expect(compareSameSizeUint8Arrays(left, right)).to.equal(-1);
    });
  });
});
