import type { SinonSpy } from 'sinon';
import { utils, random, ready as cryptoReady, tcrypto, encryptionV4, encryptionV3 } from '@tanker/crypto';
import { DecryptionFailed, InvalidArgument } from '@tanker/errors';
import { expect, sinon, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';
import { Writable } from '@tanker/stream-base';

import { DecryptionStream } from '../DecryptionStream';
import { PromiseWrapper } from '../../PromiseWrapper';

// Needed to run in IE without polyfilling `String.prototype.repeat()`
// extract from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat#polyfill
// without error checking
function repeat(string: string, c: number) {
  let str = string;
  let count = c;
  if (str.length === 0 || count === 0)
    return '';

  const maxCount = str.length * count;
  count = Math.floor(Math.log(count) / Math.log(2));
  while (count) {
    str += str;
    count -= 1;
  }
  str += str.substring(0, maxCount - str.length);
  return str;
}

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

  const encryptMsg = (index: number, str: string) => {
    const clear = utils.fromString(str);
    const encryptedChunkSize = encryptionV4.overhead + clear.length;
    const encrypted = encryptionV4.serialize(encryptionV4.encrypt(key, index, resourceId, encryptedChunkSize, clear));
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
    const msg = encryptMsg(0, '1st message');
    const emptyMsg = encryptMsg(1, '');

    stream.write(utils.concatArrays(msg.encrypted, emptyMsg.encrypted));
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(mapper.findKey.calledOnce).to.be.true;
    expect(mapper.findKey.args[0]).to.deep.equal([resourceId]);
    expect(buffer.length).to.equal(1);
    expect(buffer[0]).to.deep.equal(msg.clear);
  });

  it('can decrypt chunks of fixed size', async () => {
    const msg1 = encryptMsg(0, '1st message');
    const msg2 = encryptMsg(1, '2nd message');
    const emptyMsg = encryptMsg(2, '');

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
    const msg1 = encryptMsg(0, '1st message');
    const msg2 = encryptMsg(1, '2nd');

    stream.write(msg1.encrypted);
    stream.write(msg2.encrypted);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(2);
    expect(buffer[0]).to.deep.equal(msg1.clear);
    expect(buffer[1]).to.deep.equal(msg2.clear);
  });

  it('can decrypt a test vector (empty data)', async () => {
    const emptyTestVector = new Uint8Array([
      // version
      0x4,
      // encrypted chunk size
      0x0, 0x0, 0x10, 0x0,
      // resource id
      0x5e, 0x44, 0x54, 0xa7, 0x83, 0x21, 0xd8, 0x77, 0x8c, 0x7a, 0x25, 0xc9,
      0x46, 0x52, 0xa, 0x60,
      // iv seed
      0x1d, 0xb1, 0x25, 0xaf, 0x1e, 0x85, 0x84, 0xa9, 0xcf, 0x19, 0x71, 0x26,
      0x79, 0xf3, 0x47, 0xd1, 0xf6, 0xf0, 0xf7, 0x2, 0x85, 0x47, 0xfb, 0xe8,
      // (no encrypted data) + mac
      0x5e, 0x16, 0x25, 0x33, 0xf6, 0x66, 0x7b, 0xb9, 0xd5, 0xa5, 0x1d, 0xe9,
      0x23, 0x71, 0xb, 0x75,
    ]);

    key = new Uint8Array([
      0xda, 0xa5, 0x3d, 0x7, 0xc, 0x4b, 0x63, 0x54, 0xe3, 0x6f, 0x96, 0xc1,
      0x14, 0x4c, 0x23, 0xcc, 0x16, 0x23, 0x52, 0xa1, 0xc5, 0x53, 0xe3, 0xea,
      0xd9, 0xc4, 0x1d, 0x28, 0x4c, 0x45, 0x43, 0xa9,
    ]);

    resourceId = new Uint8Array([
      0x5e, 0x44, 0x54, 0xa7, 0x83, 0x21, 0xd8, 0x77, 0x8c, 0x7a, 0x25, 0xc9,
      0x46, 0x52, 0xa, 0x60,
    ]);

    stream.write(emptyTestVector);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(mapper.findKey.calledOnce).to.be.true;
    expect(mapper.findKey.args[0]).to.deep.equal([resourceId]);
    expect(buffer.length).to.equal(0); // no data
  });

  it('can decrypt a test vector (with data)', async () => {
    const testMessage = 'this is a secret';
    const testVector = new Uint8Array([
      // version
      0x4,
      // encrypted chunk size
      0x0, 0x0, 0x10, 0x0,
      // resource id
      0xf2, 0x38, 0x50, 0x31, 0x6c, 0xfa, 0xaa, 0x96, 0x8c, 0x1b, 0x25, 0x43,
      0xf4, 0x38, 0xe3, 0x61,
      // iv seed
      0x55, 0x24, 0x50, 0xe8, 0x3b, 0x3, 0xe9, 0xf6, 0x1, 0xf1, 0x73, 0x5f,
      0x3e, 0x52, 0xb2, 0x8f, 0xc0, 0x1f, 0xd, 0xcd, 0xac, 0x8f, 0x5, 0x2a,
      // encrypted data + mac
      0xbd, 0x31, 0x32, 0xe, 0x16, 0xdd, 0x20, 0x40, 0x58, 0xa2, 0xfe, 0xc6,
      0xf3, 0x5d, 0xff, 0x25, 0xe8, 0xc9, 0x33, 0xc1, 0x8, 0xe0, 0xb1, 0xb0,
      0xb, 0xe4, 0x86, 0x8c, 0x36, 0xb8, 0x2f, 0xbf,
    ]);

    key = new Uint8Array([
      0xaf, 0x38, 0x67, 0x9d, 0x20, 0x56, 0x38, 0x6b, 0xef, 0xdd, 0x62, 0x6d,
      0x60, 0x1b, 0xf9, 0x39, 0xad, 0x71, 0x43, 0xc0, 0x30, 0x14, 0xed, 0xea,
      0x56, 0xff, 0x1f, 0x8a, 0x30, 0x90, 0xb6, 0x8b,
    ]);

    resourceId = new Uint8Array([
      0xf2, 0x38, 0x50, 0x31, 0x6c, 0xfa, 0xaa, 0x96, 0x8c, 0x1b, 0x25, 0x43,
      0xf4, 0x38, 0xe3, 0x61,
    ]);

    stream.write(testVector);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(mapper.findKey.calledOnce).to.be.true;
    expect(mapper.findKey.args[0]).to.deep.equal([resourceId]);
    expect(buffer.length).to.equal(1);
    expect(utils.toString(buffer[0]!)).to.equal(testMessage);
  });

  it('can decrypt a test vector (with multiple chunks)', async () => {
    const testMessage = 'this is a secret';

    const testVector = new Uint8Array([
      // version
      0x4,
      // encrypted chunk size
      0x46, 0x0, 0x0, 0x0,
      // resource id
      0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b, 0x27, 0x32, 0xc9, 0xa, 0x1e,
      0xc6, 0x8f, 0x2b, 0xdb,
      // iv seed
      0xcd, 0x7, 0xd0, 0x3a, 0xc8, 0x74, 0xe1, 0x8, 0x7e, 0x5e, 0xaa, 0xa2,
      0x82, 0xd8, 0x8b, 0xf5, 0xed, 0x22, 0xe6, 0x30, 0xbb, 0xaa, 0x9d, 0x71,
      // encrypted data + mac
      0xe3, 0x9a, 0x4, 0x22, 0x67, 0x3d, 0xdf, 0xcf, 0x28, 0x48, 0xe2, 0xeb,
      0x4b, 0xb4, 0x30, 0x92, 0x70, 0x23, 0x49, 0x1c, 0xc9, 0x31, 0xcb, 0xda,
      0x1a,
      // version
      0x4,
      // encrypted chunk size
      0x46, 0, 0, 0,
      // resource id
      0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b, 0x27, 0x32, 0xc9, 0xa, 0x1e,
      0xc6, 0x8f, 0x2b, 0xdb,
      // iv see
      0x3f, 0x34, 0xf3, 0xd3, 0x23, 0x90, 0xfc, 0x6, 0x35, 0xda, 0x99, 0x1e,
      0x81, 0xdf, 0x88, 0xfc, 0x21, 0x1e, 0xed, 0x3a, 0x28, 0x2d, 0x51, 0x82,
      // encrypted data + mac
      0x77, 0x7c, 0xf6, 0xbe, 0x54, 0xd4, 0x92, 0xcd, 0x86, 0xd4, 0x88, 0x55,
      0x20, 0x1f, 0xd6, 0x44, 0x47, 0x30, 0x40, 0x2f, 0xe8, 0xf4, 0x50,
    ]);

    key = new Uint8Array([
      0xa, 0x7, 0x3d, 0xd0, 0x2c, 0x2d, 0x17, 0xf9, 0x49, 0xd9, 0x35, 0x8e, 0xf7,
      0xfe, 0x7b, 0xd1, 0xf6, 0xb, 0xf1, 0x5c, 0xa4, 0x32, 0x1e, 0xe4, 0xaa, 0x18,
      0xe1, 0x97, 0xbf, 0xf4, 0x5e, 0xfe,
    ]);

    resourceId = new Uint8Array([
      0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b, 0x27, 0x32, 0xc9, 0xa, 0x1e, 0xc6,
      0x8f, 0x2b, 0xdb,
    ]);

    stream.write(testVector);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(mapper.findKey.calledOnce).to.be.true;
    expect(mapper.findKey.args[0]).to.deep.equal([resourceId]);
    expect(buffer.length).to.equal(2);
    expect(utils.toString(utils.concatArrays(...buffer))).to.equal(testMessage);
  });

  describe('Errors', () => {
    let chunks: Array<Uint8Array>;

    beforeEach(async () => {
      const msg1 = encryptMsg(0, '1st message');
      const msg2 = encryptMsg(1, '2nd message');
      chunks = [msg1.encrypted, msg2.encrypted];
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
        const chunk = repeat('0', chunkSize);
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
            msg = encryptMsg(idx, chunk);
            bufferCounter.incrementInput(msg.encrypted.length);
            timeout.reset();
          } while (bufferCounter.inputWritten < inputSize && stream.write(msg.encrypted));

          if (bufferCounter.inputWritten === inputSize) {
            const emptyMsg = encryptMsg(idx, '');
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
