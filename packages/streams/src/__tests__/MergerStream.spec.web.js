// @flow
import { utils } from '@tanker/crypto';

import { expect } from './chai';
import MergerStream from '../MergerStream.web';

const toUint8Array = (input: ArrayBuffer | Uint8Array | Blob | File): Promise<Uint8Array> => new Promise((resolve, reject) => {
  if (input instanceof ArrayBuffer) {
    resolve(new Uint8Array(input));
    return;
  }

  if (input instanceof Uint8Array) {
    resolve(input);
    return;
  }

  const reader = new FileReader();
  reader.addEventListener('load', (event: any) => resolve(new Uint8Array(event.target.result)));
  reader.addEventListener('error', reject);
  reader.readAsArrayBuffer(input);
});

describe('MergerStream (web)', () => {
  let bytes: Uint8Array;
  let input: Array<Uint8Array>;

  before(() => {
    bytes = utils.fromString('0123456789abcdef');

    input = [
      bytes.subarray(0, 8),
      bytes.subarray(8, 10),
      bytes.subarray(10, bytes.length),
    ];
  });

  it('assumes Uint8Array if no type given', () => {
    const stream = new MergerStream();
    expect(stream._type).to.equal('Uint8Array'); // eslint-disable-line no-underscore-dangle
  });

  [
    { type: 'ArrayBuffer' },
    { type: 'Uint8Array' },
    { type: 'Blob' },
    { type: 'File', filename: 'a-file-name.txt' },
  ].forEach(options => {
    const { type } = options;
    const expectedType = type || 'Uint8Array';

    it(`can merge binary chunks into a ${type || 'Uint8Array'}`, async () => {
      const stream = new MergerStream(options);

      const output: Array<Uint8Array> = [];
      stream.on('data', (data) => { output.push(data); });

      const testPromise = new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', async () => {
          try {
            expect(output).to.have.lengthOf(1);
            expect(output[0]).to.be.an.instanceOf(window[expectedType]);
            const outputBytes = await toUint8Array(output[0]);
            expect(outputBytes).to.deep.equal(bytes);
            if (type === File) {
              // $FlowExpectedError
              expect(output[0].name).to.equal(options.filename);
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
