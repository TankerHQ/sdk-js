import FilePonyfill from '@tanker/file-ponyfill';
import { expect } from '@tanker/test-utils';
import { InvalidArgument } from '@tanker/errors';

import { castData, getConstructor, getConstructorName, getDataLength, assertInteger, assertString, assertNotEmptyString } from '../data-types';
import type { Data } from '../data-types';
import type { Class } from '../utils';

describe('types', () => {
  // In Edge and IE11, accessing the webkitRelativePath property on File instances triggers
  // a "TypeError: Invalid calling object", although the property exists. We avoid this error
  // by comparing only a subset of useful File properties:
  const fileProps = (obj: Record<string, any>) => {
    const { name, size, type, lastModified } = obj;
    return { name, size, type, lastModified };
  };

  const expectSameType = <A extends Data, B extends Data>(a: A, b: B) => expect(getConstructor(a)).to.equal(getConstructor(b));

  const expectSameLength = <A extends Data, B extends Data>(a: A, b: B) => expect(getDataLength(a)).to.equal(getDataLength(b));

  const expectDeepEqual = <A extends Data, B extends Data>(a: A, b: B) => {
    if (global.File && a instanceof File) {
      expect(fileProps(a)).to.deep.equal(fileProps(b));
      return;
    }

    expect(a).to.deep.equal(b);
  };

  const values: { type: Class<Data>, data: Data }[] = [];

  const uint8array = new Uint8Array(8);
  uint8array.set([0, 1, 2, 3, 4, 42, 128, 255]); // no .from() in IE11

  const arraybuffer = uint8array.buffer;
  values.push({ type: ArrayBuffer, data: arraybuffer });
  values.push({ type: Uint8Array, data: uint8array });

  if (global.Buffer) {
    values.push({ type: Buffer, data: Buffer.from(arraybuffer) });
  }

  if (global.Blob) {
    const blob = new Blob([uint8array], { type: 'application/octet-stream' });
    values.push({ type: Blob, data: blob });
  }

  if (global.File) {
    const file = new FilePonyfill([uint8array], 'report.pdf', { type: 'application/pdf' });
    values.push({ type: File, data: file });
  }

  values.forEach(({ type, data }) => {
    it(`can cast a ${getConstructorName(type)} into the same type`, async () => {
      const casted = await castData(data, { type });
      expectSameType(casted, data);
      expectSameLength(casted, data);
      expectDeepEqual(casted, data);
    });
  });

  values.forEach(({ type: originalType, data }) => {
    values.forEach(({ type: transientType }) => {
      if (originalType === transientType) return;

      it(`can cast a ${getConstructorName(originalType)} into a ${getConstructorName(transientType)} and back to a ${getConstructorName(originalType)}`, async () => {
        const casted = await castData(data, { type: transientType });
        expect(casted).to.be.an.instanceOf(transientType);
        expectSameLength(casted, data);

        const back = await castData(data, { type: originalType });
        expectSameType(back, data);
        expectSameLength(back, data);
        expectDeepEqual(back, data);
      });
    });
  });

  describe('assertInteger', () => {
    [-37, -5, 0, 7, 331].forEach(n => it(`detects ${n} as an integer`, () => {
      expect(() => assertInteger(n, 'n', false)).to.not.throw();
    }));

    [0, 7, 331].forEach(n => it(`detects ${n} as an unsigned integer`, () => {
      expect(() => assertInteger(n, 'n', true)).to.not.throw();
    }));

    it('throw an InvalidArgument when detecting as an integer', () => {
      [undefined, null, 'not an integer', [], {}, 0.1].forEach((n, i) => {
        expect(() => assertInteger(n, 'n', false), `failed test #${i}`).to.throw(InvalidArgument);
      });
    });

    it('throw an InvalidArgument when detecting as an unsigned integer', () => {
      [undefined, null, 'not an unsigned integer', [], {}, 0.1, -0.1, -1].forEach((n, i) => {
        expect(() => assertInteger(n, 'n', true), `failed test #${i}`).to.throw(InvalidArgument);
      });
    });
  });

  describe('assertString', () => {
    ['', 'zzzzzz', "'à-é'ç&é&é&ç"].forEach(str => it(`detects "${str}" as a string`, () => {
      expect(() => assertString(str, 'str')).to.not.throw();
    }));

    it('throw an InvalidArgument when detecting a non-string', () => {
      [undefined, null, [], {}, 0, 1].forEach((str, i) => {
        expect(() => assertString(str, 'str'), `failed test #${i}`).to.throw(InvalidArgument);
      });
    });
  });

  describe('assertNotEmptyString', () => {
    ['zzzzzz', "'à-é'ç&é&é&ç"].forEach(str => it(`detects "${str}" as a string`, () => {
      expect(() => assertNotEmptyString(str, 'str')).to.not.throw();
    }));

    it('throw an InvalidArgument when detecting a non-string or an empty string', () => {
      [undefined, null, [], {}, 0, 1, ''].forEach((str, i) => {
        expect(() => assertNotEmptyString(str, 'str'), `failed test #${i}`).to.throw(InvalidArgument);
      });
    });
  });
});
