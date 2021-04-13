// @flow
import { Writable } from 'readable-stream';
import { expect, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';

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

  [5, 30].forEach((dataSize) => {
    // Create a buffer with consecutive integers: 0, 1, 2, ...
    const data = new Uint8Array(Array.from({ length: dataSize }, (_, k) => k % 256));

    [1, 4, 7, 10].forEach((outputSize) => {
      it(`can split a buffer of size ${dataSize} in chunks of size ${outputSize}`, async () => {
        const expectedChunkCount = Math.ceil(dataSize / outputSize);
        const expectedChunks = new Array(expectedChunkCount);
        for (let i = 0; i < expectedChunkCount; i++) {
          expectedChunks[i] = data.subarray(i * outputSize, Math.min((i + 1) * outputSize, dataSize));
        }

        const stream = new ResizerStream(outputSize);

        await new Promise((resolve, reject) => {
          stream.on('data', callback);
          stream.on('error', reject);
          stream.on('end', resolve);
          stream.write(data);
          stream.end();
        });

        expect(buffer).to.deep.equal(expectedChunks);
      });
    });
  });

  it('stores data, if outputSize is not reached, until end is called', async () => {
    const stream = new ResizerStream(40);
    stream.on('data', callback);

    const data1 = new Uint8Array(10);
    const data2 = new Uint8Array(10);

    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('end', resolve);

      stream.write(data1);
      stream.write(data2);
      expect(buffer.length).to.be.equal(0);

      stream.end();
    });

    expect(buffer.length).to.be.equal(1);
    expect(buffer[0].length).to.be.equal(20);
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

  const coef = 3;
  describe(`buffers at most ${coef} * max encrypted chunk size`, () => {
    [10, 50, 100].forEach((chunkSize) => {
      [1, 2, 3, 7].forEach((nbDiv) => {
        const resizeSize = Math.ceil(chunkSize / nbDiv);
        const inputSize = chunkSize * 5;
        it(`supports back pressure when piped to a slow writable with ${chunkSize} bytes input chunks resized to ${resizeSize}`, async () => {
          const stream = new ResizerStream(resizeSize);
          const timeout = makeTimeoutPromise(20);
          const bufferCounter = new BufferingObserver();
          const slowWritable = new Writable({
            highWaterMark: 1,
            objectMode: true,
            write: async (data, encoding, done) => {
              // flood every stream before unlocking writting end
              await timeout.promise;
              bufferCounter.incrementOutputAndSnapshot(data.length);
              done();
            }
          });

          const chunk = new Uint8Array(chunkSize);
          const continueWriting = () => {
            do {
              timeout.reset();
              bufferCounter.incrementInput(chunk.length);
            } while (bufferCounter.inputWritten < inputSize && stream.write(chunk));

            if (bufferCounter.inputWritten >= inputSize) {
              stream.end();
            }
          };

          await new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('drain', continueWriting);
            slowWritable.on('finish', resolve);
            stream.pipe(slowWritable);

            continueWriting();
          });

          bufferCounter.snapshots.forEach((bufferedLength) => {
            expect(bufferedLength).to.be.at.most(coef * chunkSize, `buffered data exceeds threshold (${coef} * chunk size): got ${bufferedLength}, chunk (size: ${chunkSize})`);
          });
        });
      });
    });
  });
});
