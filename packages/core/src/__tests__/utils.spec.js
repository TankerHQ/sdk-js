// @flow
import { InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { toBase64, fromBase64, toString, fromString, findIndex, compareSameSizeUint8Arrays } from '../utils';

const notStringTypes = [undefined, null, 0, {}, [], new Uint8Array(0)];
const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'wat'];

describe('utils (core)', () => {
  // Note: the correct behavior of these utils is already tested in @tanker/crypto,
  //       so we just need to check that InvalidArgument is thrown when needed.
  describe('argument checking for utils from @tanker/crypto', () => {
    it('should throw when toBase64 is given an invalid type', () => {
      // $FlowExpectedError
      notUint8ArrayTypes.forEach((v, i) => expect(() => toBase64(v), `#${i}`).to.throw(InvalidArgument));
    });

    it('should throw when fromBase64 is given an invalid type', () => {
      // $FlowExpectedError
      notStringTypes.forEach((v, i) => expect(() => fromBase64(v), `#${i}`).to.throw(InvalidArgument));
    });

    it('should throw when toString is given an invalid type', () => {
      // $FlowExpectedError
      notUint8ArrayTypes.forEach((v, i) => expect(() => toString(v), `#${i}`).to.throw(InvalidArgument));
    });

    it('should throw when fromString is given an invalid type', () => {
      // $FlowExpectedError
      notStringTypes.forEach((v, i) => expect(() => fromString(v), `#${i}`).to.throw(InvalidArgument));
    });
  });

  describe('findIndex', () => {
    it('should find the first element matching the predicate function', () => {
      expect(findIndex([0, 1, 2, 3, 4], (el) => el > 1)).to.equal(2);
      expect(findIndex(['a', 'b', 'c'], (el) => el === 'b')).to.equal(1);
      expect(findIndex([1, 3, 5, 7, 9], (el) => el % 2 === 0)).to.equal(-1);
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
