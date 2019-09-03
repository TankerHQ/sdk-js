// @flow
import { expect } from './chai';
import ResizerStream from '../ResizerStream';

describe('ResizerStream', () => {
  let buffer: Array<Uint8Array>;
  let callback;

  before(() => {
    callback = (data) => buffer.push(data);
  });

  beforeEach(() => {
    buffer = [];
  });

  [1, 10].forEach((size) => {
    it(`can split in chunks of size: ${size}`, async () => {
      const stream = new ResizerStream(size);
      stream.on('data', callback);

      const data = new Uint8Array(30);

      stream.write(data);
      let i = 0;
      for (; i < buffer.length - 1; ++i) {
        expect(buffer[i].length).to.equal(size);
      }
      const totalSize = i * size + buffer[buffer.length - 1].length;
      expect(totalSize).to.be.equal(data.length);
    });
  });

  it('stores data, if outputSize is not reached, until end is called', async () => {
    const stream = new ResizerStream(40);
    stream.on('data', callback);

    const data1 = new Uint8Array(10);
    const data2 = new Uint8Array(10);

    stream.write(data1);
    stream.write(data2);

    expect(buffer.length).to.be.equal(0);

    stream.on('finish', () => {
      expect(buffer.length).to.be.equal(1);
      expect(buffer[0].length).to.be.equal(20);
    });

    stream.end();
  });

  it('stores data until outputSize is reached', async () => {
    const stream = new ResizerStream(20);
    stream.on('data', callback);

    const data1 = new Uint8Array(10);
    const data2 = new Uint8Array(10);

    stream.write(data1);

    expect(buffer.length).to.be.equal(0);

    stream.write(data2);

    expect(buffer.length).to.be.equal(1);
    expect(buffer[0].length).to.be.equal(20);
  });

  it('returns data in written order', () => {
    const stream = new ResizerStream(20);
    stream.on('data', callback);

    const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    for (let i = 0; i < data.length; ++i) {
      stream.write(data.subarray(i, i + 1));
    }

    stream.on('finish', () => {
      expect(buffer[0]).to.deep.equal(data);
    });

    stream.end();
  });
});
