// @flow
import { utils } from '@tanker/crypto';

import { expect } from './chai';
import FilePolyfill from '../File.polyfill';
import SlicerStream from '../SlicerStream';

// Because IE11 does not implement Function.prototype.name
const getConstructorName = (() => {
  const regExp = /^.*(?:function|class) +([^( ]+).*$/;

  return (constructor: Function) => {
    if (typeof constructor.name === 'string')
      return constructor.name;

    return constructor.toString().trim().split('\n')[0].replace(regExp, '$1');
  };
})();

describe('SlicerStream (web)', () => {
  const bytes: Uint8Array = utils.fromString('0123456789abcdef'); // 16 bytes
  const outputSize = 4;

  [
    { source: bytes },
    { source: bytes.buffer },
    { source: new Blob([bytes]) },
    { source: new FilePolyfill([bytes], 'file.txt') },
  ].forEach(options => {
    const { source } = options;
    const classname = getConstructorName(source.constructor);

    it(`can slice a ${classname}`, async () => {
      const stream = new SlicerStream({ ...options, outputSize });

      const output: Array<Uint8Array> = [];
      stream.on('data', (data) => { output.push(data); });

      const testPromise = new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('end', () => {
          try {
            expect(output).to.have.lengthOf(Math.ceil(bytes.length / outputSize));
            output.forEach((chunk, index) => {
              expect(chunk).to.be.an.instanceOf(Uint8Array);
              expect(chunk).to.deep.equal(bytes.subarray(index * outputSize, (index + 1) * outputSize));
            });
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      await expect(testPromise).to.be.fulfilled;
    });
  });
});
