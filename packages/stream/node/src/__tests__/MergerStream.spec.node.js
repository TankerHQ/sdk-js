// @flow
import { expect } from './chai';
import MergerStream from '../MergerStream';

const toUint8Array = (input: ArrayBuffer | Buffer | Uint8Array): Uint8Array => {
  if (input instanceof Uint8Array)
    return input;

  return new Uint8Array(input);
};

describe('MergerStream (node)', () => {
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
    { type: Buffer },
    { type: Uint8Array },
  ].forEach(options => {
    const { type } = options;

    it(`can merge binary chunks into a ${type.name}`, async () => {
      const stream = new MergerStream(options);

      const output: Array<Uint8Array> = [];
      stream.on('data', (data) => { output.push(data); });

      const testPromise = new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', async () => {
          try {
            expect(output).to.have.lengthOf(1);
            expect(output[0]).to.be.an.instanceOf(type);
            const outputBytes = toUint8Array(output[0]);
            expect(outputBytes).to.deep.equal(bytes);
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
