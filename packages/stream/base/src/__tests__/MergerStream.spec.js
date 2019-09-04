// @flow
import FilePonyfill from '@tanker/file-ponyfill';
import { expect } from '@tanker/test-utils';
import { castData, getConstructorName } from '@tanker/types';

import MergerStream from '../MergerStream';

describe('MergerStream', () => {
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

  const testOptions = [];

  testOptions.push({ type: ArrayBuffer });
  testOptions.push({ type: Uint8Array });

  if (global.Buffer) {
    testOptions.push({ type: Buffer });
  }

  if (global.Blob) {
    testOptions.push({ type: Blob, mime: 'application/octet-stream' });
  }

  if (global.File) {
    testOptions.push({ type: File, name: 'report.pdf', mime: 'application/pdf' });
    testOptions.push({ type: FilePonyfill, name: 'report.pdf', mime: 'application/pdf' });
  }

  testOptions.forEach(options => {
    const { type } = options;

    it(`can merge binary chunks into a ${getConstructorName(type)}`, async () => {
      const stream = new MergerStream(options);

      const output: Array<Uint8Array> = [];
      stream.on('data', (data) => { output.push(data); });

      const testPromise = new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('end', async () => {
          try {
            expect(output).to.have.lengthOf(1);
            expect(output[0]).to.be.an.instanceOf(type);

            const outputBytes = await castData(output[0], { type: Uint8Array });
            expect(outputBytes).to.deep.equal(bytes);

            if (global.Blob && output[0] instanceof global.Blob) {
              // $FlowExpectedError
              expect(output[0].type).to.equal(options.mime);
            }
            if (global.File && output[0] instanceof global.File) {
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
