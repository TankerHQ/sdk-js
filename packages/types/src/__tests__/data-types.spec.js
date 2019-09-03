// @flow
import FilePonyfill from '@tanker/file-ponyfill';
import { expect } from '@tanker/test-utils';

import { castData, getConstructor, getConstructorName, getDataLength } from '../data-types';

describe('types', () => {
  // In Edge and IE11, accessing the webkitRelativePath property on File instances triggers
  // a "TypeError: Invalid calling object", although the property exists. We avoid this error
  // by comparing only a subset of useful File properties:
  const fileProps = (obj: Object) => {
    const { name, size, type, lastModified } = obj;
    return { name, size, type, lastModified };
  };
  const expectSameType = (a: Object, b: Object) => expect(getConstructor(a)).to.equal(getConstructor(b));
  const expectSameLength = (a: Object, b: Object) => expect(getDataLength(a)).to.equal(getDataLength(b));
  const expectDeepEqual = (a: Object, b: Object) => {
    if (global.File && a instanceof File) {
      expect(fileProps(a)).to.deep.equal(fileProps(b));
      return;
    }
    expect(a).to.deep.equal(b);
  };

  const values = [];

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
});
