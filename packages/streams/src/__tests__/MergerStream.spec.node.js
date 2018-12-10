// @flow
import { utils } from '@tanker/crypto';

import { expect } from './chai';
import MergerStream from '../MergerStream.node';

describe('MergerStream (node)', () => {
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

  it('can merge binary chunks into a single binary', async () => {
    const stream = new MergerStream();
    const output: Array<Uint8Array> = [];
    stream.on('data', (data) => { output.push(data); });

    const testPromise = new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', async () => {
        expect(output).to.have.lengthOf(1);
        expect(output[0]).to.be.an.instanceOf(Uint8Array);
        expect(output[0]).to.deep.equal(bytes);
        resolve();
      });
    });

    input.forEach(chunk => stream.write(chunk));
    stream.end();

    await expect(testPromise).to.be.fulfilled;
  });
});
