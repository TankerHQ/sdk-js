// @flow
import { expect } from './chai';
import { fromUint32le, fromUint64le, toUint32le, toUint64le } from '../number';

describe('number', () => {
  let testValues;
  const toFuncs = { toUint32le, toUint64le };
  const fromFuncs = { fromUint32le, fromUint64le };

  before(() => {
    testValues = [
      { number: 0, bytes: [0, 0, 0, 0, 0, 0, 0, 0] },
      { number: 42, bytes: [42, 0, 0, 0, 0, 0, 0, 0] },
      { number: 255, bytes: [255, 0, 0, 0, 0, 0, 0, 0] },
      { number: 256, bytes: [0, 1, 0, 0, 0, 0, 0, 0] },
      { number: 1024, bytes: [0, 4, 0, 0, 0, 0, 0, 0] },
      { number: 704708436, bytes: [84, 255, 0, 42, 0, 0, 0, 0] },
      { number: Number.MAX_SAFE_INTEGER, bytes: [255, 255, 255, 255, 255, 255, 31, 0] },
    ];
  });

  [32, 64].forEach(bitLength => {
    const funcName = `toUint${bitLength}le`;
    const func = toFuncs[funcName];

    describe(funcName, () => {
      it('should throw if invalid value to convert', async () => {
        expect(() => func('1')).to.throw(TypeError); // not a number
        expect(() => func(-1)).to.throw(TypeError); // not unsigned
        expect(() => func(NaN)).to.throw(TypeError); // NaN is invalid
        expect(() => func(Number.MAX_SAFE_INTEGER + 1)).to.throw(TypeError); // too big for safe JS calculations
      });

      it('should return a Uint8Array in expected format', async () => {
        testValues.forEach(({ number, bytes }) => {
          if (number > 2 ** bitLength - 1) return; // skip values to big for the current format

          const expectedValue = new Uint8Array(bytes.slice(0, bitLength / 8));
          expect(func(number)).to.deep.equal(expectedValue);
        });
      });
    });
  });

  [32, 64].forEach(bitLength => {
    const funcName = `fromUint${bitLength}le`;
    const func = fromFuncs[funcName];

    describe(funcName, () => {
      it('should throw if invalid value to convert', async () => {
        expect(() => func(10)).to.throw(TypeError); // not an Uint8Array
        expect(() => func(new Uint8Array(7))).to.throw(TypeError); // wrong length
        expect(() => func(new Uint8Array([0, 0, 0, 0, 0, 0, 32, 0]))).to.throw(TypeError); // too big for safe JS calculations
        expect(() => func(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]))).to.throw(TypeError); // too big for safe JS calculations
      });

      it('should return a number', async () => {
        testValues.forEach(({ number, bytes }, i) => {
          if (number > 2 ** bitLength - 1) return; // skip values to big for the current format

          const value = new Uint8Array(bytes.slice(0, bitLength / 8));
          expect(func(value), `failed test #${i}`).to.equal(number);
        });
      });
    });
  });
});
