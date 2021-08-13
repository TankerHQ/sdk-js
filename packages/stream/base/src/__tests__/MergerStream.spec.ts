import FilePonyfill from '@tanker/file-ponyfill';
import { expect } from '@tanker/test-utils';
import { castData, getConstructorName } from '@tanker/types';
import type { Class, ResourceMetadata, Data } from '@tanker/types';

import MergerStream from '../MergerStream';

describe('MergerStream', () => {
  const testBytes = new Uint8Array([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102]); // 16 bytes

  const inputs = [{
    bytes: new Uint8Array(0),
    chunks: [],
  }, {
    bytes: new Uint8Array(0),
    chunks: [new Uint8Array(0)],
  }, {
    bytes: testBytes,
    // 16 bytes
    chunks: [
      testBytes.subarray(0, 8),
      testBytes.subarray(8, 10),
      testBytes.subarray(10, testBytes.length),
    ],
  }];

  const outputOptions: Array<{ type: Class<Data> } & ResourceMetadata> = [];
  outputOptions.push({ type: ArrayBuffer });
  outputOptions.push({ type: Uint8Array });

  if (global.Buffer) {
    outputOptions.push({ type: Buffer });
  }

  if (global.Blob) {
    outputOptions.push({ type: Blob, mime: 'application/octet-stream' });
  }

  if (global.File) {
    outputOptions.push({ type: File, name: 'report.pdf', mime: 'application/pdf' });
    outputOptions.push({ type: FilePonyfill, name: 'report.pdf', mime: 'application/pdf' });
  }

  inputs.forEach(input => {
    outputOptions.forEach(options => {
      const { type } = options;

      it(`can merge ${input.chunks.length} binary chunks into a ${input.bytes.length}-bytes ${getConstructorName(type)}`, async () => {
        const stream = new MergerStream(options);

        const output: Array<InstanceType<typeof type>> = [];
        stream.on('data', data => { output.push(data); });

        const testPromise = new Promise<void>((resolve, reject) => {
          stream.on('error', reject);
          stream.on('end', async () => {
            try {
              expect(output).to.have.lengthOf(1);
              expect(output[0]).to.be.an.instanceOf(type);

              const outputBytes = await castData(output[0]!, { type: Uint8Array });
              expect(outputBytes).to.deep.equal(input.bytes);

              if (global.Blob && output[0] instanceof global.Blob && options.mime) {
                expect(output[0].type).to.equal(options.mime);
              }

              if (global.File && output[0] instanceof global.File && options.name) {
                expect(output[0].name).to.equal(options.name);
              }

              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });

        input.chunks.forEach(chunk => stream.write(chunk));
        stream.end();

        await expect(testPromise).to.be.fulfilled;
      });
    });
  });
});
