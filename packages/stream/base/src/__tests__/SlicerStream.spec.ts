import { Writable } from 'readable-stream';
import { getConstructor, getConstructorName } from '@tanker/types';
import FilePonyfill from '@tanker/file-ponyfill';
import { expect, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';

import type { Data } from '@tanker/types';

import SlicerStream from '../SlicerStream';

describe('SlicerStream', () => {
  const bytes = new Uint8Array([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102]); // 16 bytes
  const sources: Array<Data> = [];

  sources.push(bytes); // Uint8Array
  sources.push(bytes.buffer); // ArrayBuffer

  if (global.Buffer) {
    sources.push(Buffer.from(bytes.buffer)); // Buffer
  }

  if (global.Blob) {
    sources.push(new Blob([bytes]));
  }

  if (global.File) {
    sources.push(new FilePonyfill([bytes], 'file.txt'));
  }

  sources.forEach(source => {
    [4, 5].forEach(outputSize => {
      const classname = getConstructorName(getConstructor(source));

      it(`slices a ${classname} in chunks of size ${outputSize}`, async () => {
        const stream = new SlicerStream({ source, outputSize });

        const output: Array<Uint8Array> = [];

        await new Promise((resolve, reject) => {
          stream.on('error', reject);
          stream.on('end', resolve);
          stream.on('data', data => { output.push(data); });
        });

        expect(output).to.have.lengthOf(Math.ceil(bytes.length / outputSize));

        output.forEach((chunk, index) => {
          expect(chunk).to.be.an.instanceOf(Uint8Array);
          expect(chunk).to.deep.equal(bytes.subarray(index * outputSize, Math.min((index + 1) * outputSize, bytes.length)));
        });
      });

      it(`slices a ${classname} in chunks of size ${outputSize} while buffering at most ${outputSize} bytes`, async () => {
        const bufferCounter = new BufferingObserver();
        const stream = new SlicerStream({ source, outputSize });
        const timeout = makeTimeoutPromise(20);

        // hijack push to control size of output buffer
        const push = stream.push.bind(stream);
        stream.push = data => {
          timeout.reset();

          if (data) {
            bufferCounter.incrementInput(data.length);
          }

          return push(data);
        };

        const slowWritable = new Writable({
          highWaterMark: 1,
          objectMode: true,
          write: async (data, _, done) => {
            // flood every stream before unlocking writing end
            await timeout.promise;
            bufferCounter.incrementOutputAndSnapshot(data.length);
            done();
          },
        });

        await new Promise((resolve, reject) => {
          stream.on('error', reject);
          slowWritable.on('finish', resolve);
          stream.pipe(slowWritable);
        });

        bufferCounter.snapshots.forEach(bufferedLength => {
          expect(bufferedLength).to.be.at.most(outputSize, `buffered data exceeds threshold: got ${bufferedLength} > ${outputSize}`);
        });
      });
    });
  });
});
