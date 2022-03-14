import type { SinonSpy } from 'sinon';
import { DecryptionFailed, InvalidArgument } from '@tanker/errors';
import { expect, sinon, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';
import { Writable } from '@tanker/stream-base';
import { PromiseWrapper } from '@tanker/types';

import * as tcrypto from '../tcrypto';
import { ready as cryptoReady } from '../ready';
import { random } from '../random';
import * as utils from '../utils';
import * as encryptionV4 from '../EncryptionFormats/v4';
import * as encryptionV3 from '../EncryptionFormats/v3';
import { DecryptionStream } from '../EncryptionFormats/DecryptionStream';

describe('DecryptionStream', () => {
  let buffer: Array<Uint8Array>;
  let key: Uint8Array;
  let resourceId: Uint8Array;
  let mapper: { findKey: SinonSpy<any[], Promise<Uint8Array>> };
  let stream: DecryptionStream;
  let sync: PromiseWrapper<void>;

  const watchStream = (str: DecryptionStream) => {
    const pw = new PromiseWrapper<void>();
    buffer = [];
    str.on('data', (data: Uint8Array) => buffer.push(data));
    str.on('error', (err: Error) => pw.reject(err));
    str.on('end', () => pw.resolve());
    return pw;
  };

  const encryptMsg = (index: number, clearChunkSize: number, str: string) => {
    const clear = utils.fromString(str);
    const encryptedChunkSize = encryptionV4.overhead + clearChunkSize;
    const encrypted = encryptionV4.serialize(encryptionV4.encryptChunk(key, index, resourceId, encryptedChunkSize, clear));
    return { clear, encrypted };
  };

  before(() => cryptoReady);

  beforeEach(() => {
    key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    resourceId = random(16);
    // Note: we don't use sinon.fake.resolves(key) that would bind the key
    //       now, as the key is overridden later in some tests ;-)
    mapper = { findKey: sinon.fake(() => Promise.resolve(key)) };
    stream = new DecryptionStream(mapper);
    sync = watchStream(stream);
  });

  it('can extract header v4, resource id and message', async () => {
    const msg = encryptMsg(0, 11, '1st message');
    const emptyMsg = encryptMsg(1, 11, '');

    stream.write(utils.concatArrays(msg.encrypted, emptyMsg.encrypted));
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(mapper.findKey.calledOnce).to.be.true;
    expect(mapper.findKey.args[0]).to.deep.equal([resourceId]);
    expect(buffer.length).to.equal(1);
    expect(buffer[0]).to.deep.equal(msg.clear);
  });

  it('can decrypt chunks of fixed size', async () => {
    const msg1 = encryptMsg(0, 11, '1st message');
    const msg2 = encryptMsg(1, 11, '2nd message');
    const emptyMsg = encryptMsg(2, 11, '');

    stream.write(msg1.encrypted);
    stream.write(msg2.encrypted);
    stream.write(emptyMsg.encrypted);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(2);
    expect(buffer[0]).to.deep.equal(msg1.clear);
    expect(buffer[1]).to.deep.equal(msg2.clear);
  });

  it('can decrypt chunks of fixed size except last one', async () => {
    const msg1 = encryptMsg(0, 11, '1st message');
    const msg2 = encryptMsg(1, 11, '2nd');

    stream.write(msg1.encrypted);
    stream.write(msg2.encrypted);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(2);
    expect(buffer[0]).to.deep.equal(msg1.clear);
    expect(buffer[1]).to.deep.equal(msg2.clear);
  });

  describe('Errors', () => {
    let chunks: Array<Uint8Array>;

    beforeEach(async () => {
      const msg1 = encryptMsg(0, 11, '1st message');
      const msg2 = encryptMsg(1, 11, '2nd message');
      const emptyMsg = encryptMsg(2, 11, '');
      chunks = [msg1.encrypted, msg2.encrypted, emptyMsg.encrypted];
    });

    // This test is here to make sure the setup is correct before we start asserting on errors
    it('decrypts all the chunks', async () => {
      for (const chunk of chunks)
        stream.write(chunk);
      stream.end();
      await expect(sync.promise).to.be.fulfilled;
    });

    it('throws InvalidArgument when writing anything else than Uint8Array', async () => {
      stream.write('fail');
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
    });

    it('throws DecryptionFailed when missing empty chunk after only maximum size chunks', async () => {
      stream.write(chunks[0]!); // valid chunk of the maximum size
      stream.end();
      await expect(sync.promise).to.be.rejectedWith(DecryptionFailed);
    });

    it('throws DecryptionFailed when data is corrupted', async () => {
      chunks[0]![61] += 1;
      stream.write(chunks[0]!); // corrupted chunk
      await expect(sync.promise).to.be.rejectedWith(DecryptionFailed);
    });

    it('throws InvalidArgument when the header is not fully given during first write', async () => {
      const incompleteHeader = chunks[0]!.subarray(0, 1);
      stream.write(incompleteHeader);
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
    });

    it('throws InvalidArgument when the header is corrupted', async () => {
      chunks[0]![0] = 255; // unknown version number
      stream.write(chunks[0]);
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
    });

    it('throws DecryptionFailed when data is written in wrong order', async () => {
      stream.write(chunks[1]!);
      await expect(sync.promise).to.be.rejectedWith(DecryptionFailed);
    });

    it('throws DecryptionFailed when encryptedChunkSize does not match between headers', async () => {
      chunks[1]![1] -= 1;
      for (const chunk of chunks)
        stream.write(chunk);
      await expect(sync.promise).to.be.rejectedWith(DecryptionFailed);
    });

    it('throws DecryptionFailed when resource ID does not match between headers', async () => {
      chunks[1]![5] -= 1;
      for (const chunk of chunks)
        stream.write(chunk);
      await expect(sync.promise).to.be.rejectedWith(DecryptionFailed);
    });

    it('forwards the error when the key is not found for a small resource', async () => {
      const unknownKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
      mapper.findKey = sinon.fake(() => {
        throw new InvalidArgument('some error');
      });
      const chunk = encryptionV3.serialize(encryptionV3.encrypt(unknownKey, utils.fromString('some random data')));
      stream.write(chunk);
      stream.end();
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument, 'some error');
    });

    it('forwards the error when the key is not found for a large resource', async () => {
      mapper.findKey = sinon.fake(() => {
        throw new InvalidArgument('some error');
      });
      stream.write(chunks[0]);
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument, 'some error');
    });
  });

  const coef = 3;
  describe(`buffers at most ${coef} * max encrypted chunk size`, () => {
    [10, 50, 100, 1000].forEach(chunkSize => {
      it(`supports back pressure when piped to a slow writable with ${chunkSize} bytes input chunks`, async () => {
        const timeout = makeTimeoutPromise(50);
        const chunk = '0'.repeat(chunkSize);
        const inputSize = 10 * (chunkSize + encryptionV4.overhead);
        const bufferCounter = new BufferingObserver();
        const slowWritable = new Writable({
          highWaterMark: 1,
          objectMode: true,
          write: async (data, _, done) => {
            // flood every stream before unlocking writing end
            await timeout.promise;
            bufferCounter.incrementOutputAndSnapshot(data.length + encryptionV4.overhead);
            done();
          },
        });

        let idx = -1;
        let msg;

        const continueWriting = () => {
          do {
            idx += 1;
            msg = encryptMsg(idx, chunkSize, chunk);
            bufferCounter.incrementInput(msg.encrypted.length);
            timeout.reset();
          } while (bufferCounter.inputWritten < inputSize && stream.write(msg.encrypted));

          if (bufferCounter.inputWritten === inputSize) {
            const emptyMsg = encryptMsg(idx, chunkSize, '');
            stream.write(emptyMsg.encrypted);
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
        bufferCounter.snapshots.forEach(bufferedLength => {
          expect(bufferedLength).to.be.at.most(
            coef * (chunkSize + encryptionV4.overhead),
            `buffered data exceeds threshold (${coef} * chunk size): got ${bufferedLength}, chunk (size: ${chunkSize} + overhead: ${encryptionV4.overhead})`,
          );
        });
      });
    });
  });
});
