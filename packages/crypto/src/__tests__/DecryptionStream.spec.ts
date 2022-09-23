import type { SinonSpy } from 'sinon';
import { InvalidArgument } from '@tanker/errors';
import { expect, sinon, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';
import { Writable } from '@tanker/stream-base';
import { PromiseWrapper } from '@tanker/types';

import { Padding, padClearData } from '../padding';
import * as tcrypto from '../tcrypto';
import { ready as cryptoReady } from '../ready';
import { random } from '../random';
import * as utils from '../utils';
import { EncryptionV3 } from '../EncryptionFormats/v3';
import { EncryptionV4 } from '../EncryptionFormats/v4';
import { EncryptionV8 } from '../EncryptionFormats/v8';
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

  describe('Errors', () => {
    it('throws InvalidArgument when writing anything else than Uint8Array', async () => {
      stream.write('fail');
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
    });

    it('throws InvalidArgument when the header is not fully given during first write', async () => {
      const incompleteHeader = new Uint8Array([4]);
      stream.write(incompleteHeader);
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
    });

    it('throws InvalidArgument when the header is corrupted', async () => {
      const invalidHeader = new Uint8Array([255]); // unknown version number
      stream.write(invalidHeader);
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
    });

    it('forwards the error when the key is not found for a simple resource', async () => {
      const unknownKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
      mapper.findKey = sinon.fake(() => {
        throw new InvalidArgument('some error');
      });
      const chunk = EncryptionV3.serialize(EncryptionV3.encrypt(unknownKey, utils.fromString('some random data')));
      stream.write(chunk);
      stream.end();
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument, 'some error');
    });

    it('forwards the error when the key is not found for a resource v4', async () => {
      mapper.findKey = sinon.fake(() => {
        throw new InvalidArgument('some error');
      });

      const clear = utils.fromString('test');
      const encryptedChunk = EncryptionV4.serialize(EncryptionV4.encryptChunk(key, 0, resourceId, EncryptionV4.overhead + clear.length, clear));
      stream.write(encryptedChunk);
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument, 'some error');
    });

    it('forwards the error when the key is not found for a resource v8', async () => {
      mapper.findKey = sinon.fake(() => {
        throw new InvalidArgument('some error');
      });

      const clear = padClearData(utils.fromString('test'));
      const encryptedChunk = EncryptionV8.serialize(EncryptionV8.encryptChunk(key, 0, resourceId, EncryptionV8.overhead + clear.length, clear));
      stream.write(encryptedChunk);
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument, 'some error');
    });
  });

  type TestParameters = {
    encryptMsg: (index: number, clearChunkSize: number, str: string) => { clear: Uint8Array, encrypted: Uint8Array },
    overhead: number,
  };

  const coef = 3;
  const generateBufferTests = ({ encryptMsg, overhead }: TestParameters) => {
    [10, 50, 100, 1000].forEach(chunkSize => {
      it(`supports back pressure when piped to a slow writable with ${chunkSize} bytes input chunks`, async () => {
        const timeout = makeTimeoutPromise(50);
        const chunk = '0'.repeat(chunkSize);
        const inputSize = 10 * (chunkSize + overhead);
        const bufferCounter = new BufferingObserver();
        const slowWritable = new Writable({
          highWaterMark: 1,
          objectMode: true,
          write: async (data, _, done) => {
            // flood every stream before unlocking writing end
            await timeout.promise;
            bufferCounter.incrementOutputAndSnapshot(data.length + overhead);
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
            coef * (chunkSize + overhead),
            `buffered data exceeds threshold (${coef} * chunk size): got ${bufferedLength}, chunk (size: ${chunkSize} + overhead: ${overhead})`,
          );
        });
      });
    });
  };

  describe(`v4 buffers at most ${coef} * max encrypted chunk size`, () => {
    generateBufferTests({
      encryptMsg: (index: number, clearChunkSize: number, str: string) => {
        const clear = utils.fromString(str);
        const encryptedChunkSize = EncryptionV4.overhead + clearChunkSize;
        const encrypted = EncryptionV4.serialize(EncryptionV4.encryptChunk(key, index, resourceId, encryptedChunkSize, clear));
        return { clear, encrypted };
      },
      overhead: EncryptionV4.overhead,
    });
  });

  describe(`v8 buffers at most ${coef} * max encrypted chunk size`, () => {
    generateBufferTests({
      encryptMsg: (index: number, clearChunkSize: number, str: string) => {
        const clear = padClearData(utils.fromString(str), Padding.OFF);
        const encryptedChunkSize = EncryptionV8.overhead + clearChunkSize;
        const encrypted = EncryptionV8.serialize(EncryptionV8.encryptChunk(key, index, resourceId, encryptedChunkSize, clear));
        return { clear, encrypted };
      },
      overhead: EncryptionV8.overhead,
    });
  });
});
