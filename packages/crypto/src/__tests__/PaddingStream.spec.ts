import { InvalidArgument } from '@tanker/errors';
import type { IWritable } from '@tanker/stream-base';
import { expect } from '@tanker/test-utils';

import { PromiseWrapper } from '@tanker/types';
import * as utils from '../utils';
import * as number from '../number';
import { PadStream, UnpadStream } from '../PaddingStream';
import { Padding } from '../padding';
import { random } from '../random';

const write = async (stream: IWritable, data: any) => {
  const res = new PromiseWrapper<void>();
  stream.write(data, (error) => {
    if (error)
      res.reject(error);
    else
      res.resolve();
  });
  return res.promise;
};

const end = async (stream: IWritable) => {
  const res = new PromiseWrapper<void>();
  try {
    stream.end(res.resolve);
  } catch (error) {
    res.reject(error);
  }
  return res.promise;
};

describe('PadStream', () => {
  [Padding.OFF, Padding.AUTO, 10, 100].forEach((padding) => {
    describe(`with padding: ${padding}`, () => {
      it('rejects illformed data', async () => {
        await Promise.all([
          undefined,
          10,
          true,
          {},
          [],
        ].map(async (data) => {
          const stream = new PadStream(10000, padding);
          await expect(write(stream, data)).to.be.rejectedWith(InvalidArgument);
        }));
      });

      it('expects fixed sized chunks', async () => {
        const chunkSize = 10;
        let stream = new PadStream(chunkSize, padding);
        // can't write more than chunkSize per call
        await expect(write(stream, new Uint8Array(chunkSize + 1))).to.be.rejectedWith(InvalidArgument);

        // can't write after smaller chunk
        stream = new PadStream(chunkSize, padding);
        await write(stream, new Uint8Array(chunkSize - 1));
        await expect(write(stream, new Uint8Array(chunkSize))).to.be.rejectedWith(InvalidArgument);
      });

      it('uses a length prefixed padding scheme', async () => {
        const chunkSize = 10;
        const result: Array<Uint8Array> = [];

        const stream = new PadStream(chunkSize, padding);
        stream.on('data', (data) => result.push(data));

        const data = random(chunkSize);

        await write(stream, data);
        await write(stream, data.slice(3));
        await end(stream);

        expect(result.length).greaterThanOrEqual(2);
        // first chunk is full of data
        expect(result[0]!.slice(4)).to.deep.equal(data);

        // second chunk contains padding
        const nbPaddingBytes = number.fromUint32le(result[1]!.slice(0, 4));
        const paddingBytes = result[1]!.slice(4, 4 + nbPaddingBytes);
        const chunkData = result[1]!.slice(4 + nbPaddingBytes);
        expect(paddingBytes).to.deep.equal(new Uint8Array(nbPaddingBytes));
        expect(chunkData).to.deep.equal(data.slice(3));
      });
    });
  });
});

describe('UnpadStream', () => {
  it('rejects illformed data', async () => {
    await Promise.all([
      undefined,
      10,
      true,
      {},
      [],
      new Uint8Array(1), // no header
      new Uint8Array([10, 0, 0, 0, 0]), // not enough padding
    ].map(async (data) => {
      const stream = new UnpadStream(10);
      await expect(write(stream, data)).to.be.rejectedWith(InvalidArgument);
    }));
  });

  it('expects fixed sized chunks', async () => {
    const chunkSize = 10;
    let stream = new UnpadStream(chunkSize);
    // can't write more than chunkSize per call
    await expect(write(stream, new Uint8Array(chunkSize + stream.overhead + 1))).to.be.rejectedWith(InvalidArgument);

    // can't write after smaller chunk (end of stream)
    stream = new UnpadStream(chunkSize);
    await write(stream, new Uint8Array(chunkSize + stream.overhead - 1));
    await expect(write(stream, new Uint8Array(chunkSize + stream.overhead))).to.be.rejectedWith(InvalidArgument);
  });

  it('rejects data after first padded chunk', async () => {
    const chunkSize = 10;

    // data after full sized but padded chunk
    const stream = new UnpadStream(chunkSize);
    await write(stream, utils.concatArrays(number.toUint32le(1), new Uint8Array(chunkSize)));
    await expect(write(stream, new Uint8Array(chunkSize + stream.overhead))).to.be.rejectedWith(InvalidArgument);
  });

  it('uses a length prefixed padding scheme', async () => {
    const chunkSize = 10;
    const result: Array<Uint8Array> = [];

    const stream = new UnpadStream(chunkSize);
    stream.on('data', (data) => result.push(data));

    const data = random(chunkSize);

    await write(stream, utils.concatArrays(number.toUint32le(0), data));
    await write(stream, utils.concatArrays(number.toUint32le(1), data));
    await write(stream, utils.concatArrays(number.toUint32le(chunkSize), new Uint8Array(chunkSize)));
    await write(stream, utils.concatArrays(number.toUint32le(0)));
    await end(stream);

    expect(result.length).to.equal(2);
    expect(result[0]).to.deep.equal(data);
    expect(result[1]).to.deep.equal(data.slice(1));
  });
});
