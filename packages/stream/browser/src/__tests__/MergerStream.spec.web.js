// @flow
import FilePonyfill from '@tanker/file-ponyfill';
import FileReader from '@tanker/file-reader';

import { expect } from './chai';
import MergerStream, { getConstructorName } from '../MergerStream';

const toUint8Array = async (input: ArrayBuffer | Uint8Array | Blob | File): Promise<Uint8Array> => {
  if (input instanceof ArrayBuffer)
    return new Uint8Array(input);

  if (input instanceof Uint8Array)
    return input;

  return new Uint8Array(await new FileReader(input).readAsArrayBuffer());
};

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

  it('assumes Uint8Array if no type given', () => {
    const stream = new MergerStream();
    expect(stream._type).to.equal(Uint8Array); // eslint-disable-line no-underscore-dangle
  });

  [
    { type: ArrayBuffer },
    { type: Uint8Array },
    { type: Blob },
    { type: File, name: 'a-file.txt' },
    { type: FilePonyfill, name: 'a-file-ponyfill.txt' },
  ].forEach(options => {
    const { type } = options;

    it(`can merge binary chunks into a ${getConstructorName(type)}`, async () => {
      const stream = new MergerStream(options);

      const output: Array<Uint8Array> = [];
      stream.on('data', (data) => { output.push(data); });

      const testPromise = new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', async () => {
          try {
            expect(output).to.have.lengthOf(1);
            expect(output[0]).to.be.an.instanceOf(type);
            const outputBytes = await toUint8Array(output[0]);
            expect(outputBytes).to.deep.equal(bytes);
            if (type === File || type === FilePonyfill) {
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
