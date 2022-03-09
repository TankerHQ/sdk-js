import { Writable } from '@tanker/stream-base';
import { InvalidArgument } from '@tanker/errors';
import { expect, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';
import { PromiseWrapper } from '@tanker/types';

import * as tcrypto from '../tcrypto';
import { ready as cryptoReady } from '../ready';
import * as aead from '../aead';
import { random } from '../random';
import * as utils from '../utils';
import * as encryptionV4 from '../EncryptionFormats/v4';
import { EncryptionStream } from '../EncryptionFormats/EncryptionStream';

describe('EncryptionStream', () => {
  let buffer: Array<Uint8Array>;
  let key: Uint8Array;
  let resourceId: Uint8Array;

  const watchStream = (stream: EncryptionStream) => {
    const sync = new PromiseWrapper<void>();
    stream.on('data', (data: Uint8Array) => buffer.push(data));
    stream.on('error', (err: Error) => sync.reject(err));
    stream.on('end', () => sync.resolve());
    return sync;
  };

  before(async () => {
    await cryptoReady;

    key = utils.fromString('12345678123456781234567812345678');
    resourceId = random(tcrypto.MAC_SIZE);
  });

  beforeEach(() => {
    buffer = [];
  });

  it('throws InvalidArgument when writing anything else than Uint8Array', async () => {
    const stream = new EncryptionStream(resourceId, key);
    const sync = watchStream(stream);

    stream.write('fail');
    stream.end();

    await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
  });

  it('can give its associated resourceId', async () => {
    const stream = new EncryptionStream(resourceId, key);
    const sync = watchStream(stream);

    expect(stream.resourceId).to.be.equal(utils.toBase64(resourceId));

    stream.end();
    await sync.promise;
  });

  it('outputs a resource from which you can read the header', async () => {
    const stream = new EncryptionStream(resourceId, key);
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    const data = encryptionV4.unserialize(buffer[0]!);

    expect(data.resourceId).to.deep.equal(resourceId);
    expect(typeof data.encryptedChunkSize).to.equal('number');
  });

  it('outputs a resource from which you can directly get the resource id', async () => {
    const stream = new EncryptionStream(resourceId, key);
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    expect(encryptionV4.extractResourceId(buffer[0]!)).to.deep.equal(resourceId);
  });

  it('derives its iv and push header before encryption', async () => {
    const msg = utils.fromString('message');
    const stream = new EncryptionStream(resourceId, key);
    const sync = watchStream(stream);

    stream.write(msg);

    expect(sync.settled).to.be.false;

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.be.equal(1);
    const data = encryptionV4.unserialize(buffer[0]!);

    expect(data.resourceId).to.deep.equal(resourceId);

    const eMsg = data.encryptedData;
    const ivSeed = data.ivSeed;
    const iv = tcrypto.deriveIV(ivSeed, 0);

    expect(() => aead.decryptAEAD(key, ivSeed, eMsg)).to.throw();
    expect(aead.decryptAEAD(key, iv, eMsg)).to.deep.equal(msg);
  });

  it('encrypts chunks of fixed size', async () => {
    const msg = utils.fromString('message');

    const encryptedChunkSize = msg.length + encryptionV4.overhead;

    const stream = new EncryptionStream(resourceId, key, encryptedChunkSize);
    const sync = watchStream(stream);

    // push msg twice
    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(3);

    buffer.forEach((_, index) => {
      const clearData = encryptionV4.decryptChunk(key, index, encryptionV4.unserialize(buffer[index]!));
      const expectedMsg = index === 2 ? new Uint8Array(0) : msg;
      expect(clearData).to.deep.equal(expectedMsg);
    });
  });

  it('encrypts chunks of fixed size except last one', async () => {
    const msg = utils.fromString('message');

    const encryptedChunkSize = msg.length + encryptionV4.overhead;

    const stream = new EncryptionStream(resourceId, key, encryptedChunkSize);
    const sync = watchStream(stream);

    // push msg twice + 1 more byte
    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);
    stream.write(msg.subarray(1));

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(3);

    buffer.forEach((_, index) => {
      const clearData = encryptionV4.decryptChunk(key, index, encryptionV4.unserialize(buffer[index]!));
      const expectedMsg = index === 2 ? msg.subarray(1) : msg;
      expect(clearData).to.deep.equal(expectedMsg);
    });
  });
  const coef = 3;
  describe(`buffers at most ${coef} * clear chunk size`, () => {
    [10, 50, 100, 1000].forEach(chunkSize => {
      it(`supports back pressure when piped to a slow writable with ${chunkSize} bytes input chunks`, async () => {
        const chunk = new Uint8Array(chunkSize);
        const inputSize = 10 * chunkSize;
        const bufferCounter = new BufferingObserver();
        const encryptionStream = new EncryptionStream(resourceId, key, chunkSize + encryptionV4.overhead);
        const timeout = makeTimeoutPromise(50);
        const slowWritable = new Writable({
          highWaterMark: 1,
          objectMode: true,
          write: async (data, _, done) => {
            await timeout.promise;
            bufferCounter.incrementOutputAndSnapshot(data.length - encryptionV4.overhead);
            done();
          },
        });

        const continueWriting = () => {
          do {
            // flood every stream before unlocking writing end
            timeout.reset();
            bufferCounter.incrementInput(chunk.length);
          } while (bufferCounter.inputWritten < inputSize && encryptionStream.write(chunk));

          if (bufferCounter.inputWritten >= inputSize) {
            encryptionStream.end();
          }
        };

        await new Promise((resolve, reject) => {
          encryptionStream.on('error', reject);
          encryptionStream.on('drain', continueWriting);
          slowWritable.on('finish', resolve);
          encryptionStream.pipe(slowWritable);
          continueWriting();
        });

        bufferCounter.snapshots.forEach(bufferedLength => {
          expect(bufferedLength).to.be.at.most(
            coef * chunkSize,
            `buffered data exceeds threshold (${coef} * chunk size): got ${bufferedLength}, chunk size ${chunkSize})`,
          );
        });
      });
    });
  });
});
