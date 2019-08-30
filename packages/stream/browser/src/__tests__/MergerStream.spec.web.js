// @flow
import FilePonyfill from '@tanker/file-ponyfill';
import { castData, getConstructorName } from '@tanker/types';

import { expect } from './chai';
import MergerStream from '../MergerStream';

describe('MergerStream (web)', () => {
  let bytes: Uint8Array;
  let input: Array<Uint8Array>;

  before(() => {
    bytes = new Uint8Array([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102]); // 16 bytes

    input = [
      bytes.subarray(0, 8),
      bytes.subarray(8, 10),
      bytes.subarray(10, bytes.length),
    ];
  });

  [
    { type: ArrayBuffer },
    { type: Uint8Array },
    { type: Blob },
    { type: File, name: 'a-file.txt' },
    { type: FilePonyfill, name: 'a-file-ponyfill.txt' },
  ].forEach(options => {
    const { type: outputType } = options;
    const outputTypeName = getConstructorName(outputType);

    it(`can merge binary chunks into a ${outputTypeName}`, async () => {
      const stream = new MergerStream(options);

      const output: Array<Uint8Array> = [];
      stream.on('data', (data) => { output.push(data); });

      const testPromise = new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', async () => {
          try {
            expect(output).to.have.lengthOf(1);
            expect(output[0]).to.be.an.instanceOf(outputType);
            const outputBytes = await castData(output[0], { type: Uint8Array });
            expect(outputBytes).to.deep.equal(bytes);
            if (outputTypeName === 'File') {
              // $FlowExpectedError
              expect(output[0].name).to.equal(options.name);
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      input.forEach(chunk => stream.write(chunk));
      stream.end();

      await expect(testPromise).to.be.fulfilled;
    });
  });
});
