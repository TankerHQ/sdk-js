import { Writable } from '@tanker/stream-base';
import { InvalidArgument } from '@tanker/errors';
import { expect, BufferingObserver, makeTimeoutPromise } from '@tanker/test-utils';
import { PromiseWrapper } from '@tanker/types';

import { Padding, removePadding } from '../padding';
import * as tcrypto from '../tcrypto';
import { ready as cryptoReady } from '../ready';
import * as aead from '../aead';
import { random } from '../random';
import * as utils from '../utils';
import { EncryptionV4 } from '../EncryptionFormats/v4';
import { EncryptionV8 } from '../EncryptionFormats/v8';
import { EncryptionStreamV4 } from '../EncryptionFormats/EncryptionStreamV4';
import { EncryptionStreamV8 } from '../EncryptionFormats/EncryptionStreamV8';
import type { StreamEncryptor } from '../EncryptionFormats/EncryptionFormats';
import { EncryptionStreamV11 } from '../EncryptionFormats/EncryptionStreamV11';
import { EncryptionV11 } from '../EncryptionFormats/TransparentEncryption';
import { unserializeCompositeResourceId, deriveSessionKey } from '../resourceId';

type EncryptionStream = EncryptionStreamV4 | EncryptionStreamV8 | EncryptionStreamV11;

type TestParameters = {
  makeEncryptionStream: (resourceId: Uint8Array, key: Uint8Array, chunkSize?: number) => EncryptionStream;
  encryption: StreamEncryptor;
  transformMsg: (message: Uint8Array) => Uint8Array,
};

const generateEncryptionStreamTests = ({ makeEncryptionStream, encryption, transformMsg }: TestParameters) => {
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
    const stream = makeEncryptionStream(resourceId, key);
    const sync = watchStream(stream);

    stream.write('fail');
    stream.end();

    await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
  });

  it('can give its associated resourceId', async () => {
    const stream = makeEncryptionStream(resourceId, key);
    const sync = watchStream(stream);

    expect(stream.resourceId).to.be.equal(utils.toBase64(resourceId));

    stream.end();
    await sync.promise;
  });

  it('outputs a resource from which you can read the header', async () => {
    const stream = makeEncryptionStream(resourceId, key);
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    const data = encryption.unserialize(buffer[0]!);

    expect(data.resourceId).to.deep.equal(resourceId);
    expect(typeof data.encryptedChunkSize).to.equal('number');
  });

  it('outputs a resource from which you can directly get the resource id', async () => {
    const stream = makeEncryptionStream(resourceId, key);
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    expect(encryption.extractResourceId(buffer[0]!)).to.deep.equal(resourceId);
  });

  it('encrypts chunks of fixed size', async () => {
    const msg = utils.fromString('message');

    const encryptedChunkSize = msg.length + encryption.overhead;

    const stream = makeEncryptionStream(resourceId, key, encryptedChunkSize);
    const sync = watchStream(stream);

    // push msg twice
    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(3);

    buffer.forEach((_, index) => {
      const clearData = encryption.decryptChunk(key, index, encryption.unserialize(buffer[index]!));
      const expectedMsg = index === 2 ? new Uint8Array(0) : msg;
      expect(transformMsg(clearData)).to.deep.equal(expectedMsg);
    });
  });

  it('encrypts chunks of fixed size except last one', async () => {
    const msg = utils.fromString('message');

    const encryptedChunkSize = msg.length + encryption.overhead;

    const stream = makeEncryptionStream(resourceId, key, encryptedChunkSize);
    const sync = watchStream(stream);

    // push msg twice + an incomplete msg
    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);
    stream.write(msg.subarray(1));

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(3);

    buffer.forEach((_, index) => {
      const clearData = encryption.decryptChunk(key, index, encryption.unserialize(buffer[index]!));
      const expectedMsg = index === 2 ? msg.subarray(1) : msg;
      expect(transformMsg(clearData)).to.deep.equal(expectedMsg);
    });
  });
  const coef = 3;
  describe(`buffers at most ${coef} * clear chunk size`, () => {
    [10, 50, 100, 1000].forEach(chunkSize => {
      it(`supports back pressure when piped to a slow writable with ${chunkSize} bytes input chunks`, async () => {
        const chunk = new Uint8Array(chunkSize);
        const inputSize = 10 * chunkSize;
        const bufferCounter = new BufferingObserver();
        const encryptionStream = makeEncryptionStream(resourceId, key, chunkSize + encryption.overhead);
        const timeout = makeTimeoutPromise(50);
        const slowWritable = new Writable({
          highWaterMark: 1,
          objectMode: true,
          write: async (data, _, done) => {
            await timeout.promise;
            bufferCounter.incrementOutputAndSnapshot(data.length - encryption.overhead);
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
};

describe('EncryptionStreamV4', () => {
  generateEncryptionStreamTests({
    makeEncryptionStream: (resourceId: Uint8Array, key: Uint8Array, chunkSize?: number) => new EncryptionStreamV4(resourceId, key, chunkSize),
    encryption: EncryptionV4,
    transformMsg: m => m,
  });

  it('derives its iv and push header before encryption', async () => {
    const buffer: Array<Uint8Array> = [];
    const key = utils.fromString('12345678123456781234567812345678');
    const resourceId = random(tcrypto.MAC_SIZE);

    const watchStream = (stream: EncryptionStream) => {
      const sync = new PromiseWrapper<void>();
      stream.on('data', (data: Uint8Array) => buffer.push(data));
      stream.on('error', (err: Error) => sync.reject(err));
      stream.on('end', () => sync.resolve());
      return sync;
    };

    const msg = utils.fromString('message');
    const stream = new EncryptionStreamV4(resourceId, key);
    const sync = watchStream(stream);

    stream.write(msg);

    expect(sync.settled).to.be.false;

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.be.equal(1);
    const data = EncryptionV4.unserialize(buffer[0]!);

    expect(data.resourceId).to.deep.equal(resourceId);

    const eMsg = data.encryptedData;
    const ivSeed = data.ivSeed;
    const iv = tcrypto.deriveIV(ivSeed, 0);

    expect(() => aead.decryptAEAD(key, ivSeed, eMsg)).to.throw();
    expect(aead.decryptAEAD(key, iv, eMsg)).to.deep.equal(msg);
  });
});

describe('EncryptionStreamV8', () => {
  generateEncryptionStreamTests({
    makeEncryptionStream: (resourceId: Uint8Array, key: Uint8Array, chunkSize?: number) => new EncryptionStreamV8(resourceId, key, Padding.OFF, chunkSize),
    encryption: EncryptionV8,
    transformMsg: removePadding,
  });
});

describe('EncryptionStreamV11', () => {
  let buffer: Array<Uint8Array>;
  let key: Uint8Array;
  let sessionId: Uint8Array;

  const makeEncryptionStream = (chunkSize?: number) => new EncryptionStreamV11(sessionId, key, Padding.OFF, chunkSize);
  const transformMsg = (m: Uint8Array) => m.slice(4);

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
    sessionId = random(tcrypto.MAC_SIZE);
  });

  beforeEach(() => {
    buffer = [];
  });

  it('throws InvalidArgument when writing anything else than Uint8Array', async () => {
    const stream = makeEncryptionStream();
    const sync = watchStream(stream);

    stream.write('fail');
    stream.end();

    await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
  });

  it('can give its associated resourceId', async () => {
    const stream = makeEncryptionStream();
    const sync = watchStream(stream);

    const compositeId = unserializeCompositeResourceId(utils.fromBase64(stream.resourceId));
    expect(compositeId.sessionId).to.deep.equal(sessionId);

    stream.end();
    await sync.promise;
  });

  it('outputs a resource from which you can read the header', async () => {
    const stream = makeEncryptionStream();
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    const data = EncryptionV11.unserializeHeader(buffer[0]!);

    expect(data.sessionId).to.deep.equal(sessionId);
    expect(typeof data.encryptedChunkSize).to.equal('number');
  });

  it('outputs a resource from which you can directly get the resource id', async () => {
    const stream = makeEncryptionStream();
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    const compositeId = unserializeCompositeResourceId(EncryptionV11.extractResourceId(buffer[0]!));
    expect(compositeId.sessionId).to.deep.equal(sessionId);
  });

  it('encrypts chunks of fixed size except last one', async () => {
    const msg = utils.fromString('message');

    const encryptedChunkSize = msg.length + EncryptionV11.chunkOverhead;

    const stream = makeEncryptionStream(encryptedChunkSize);
    const sync = watchStream(stream);

    // push msg twice + an incomplete msg
    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);
    stream.write(msg.subarray(1));

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(4);
    const compositeResourceId = unserializeCompositeResourceId(utils.fromBase64(stream.resourceId));
    const resourceKey = deriveSessionKey(key, compositeResourceId.resourceId);

    // skip header chunk
    buffer.slice(1).forEach((val, index, data) => {
      const eos = data.length - 1;
      const clearData = EncryptionV11.decryptChunk(resourceKey, index, {
        sessionId,
        resourceId: compositeResourceId.resourceId,
        encryptedChunkSize,
      }, val);
      if (index !== eos) {
        expect(val.length).to.equal(encryptedChunkSize);
        expect(transformMsg(clearData)).to.deep.equal(msg);
      } else {
        expect(val.length).to.be.lt(encryptedChunkSize);
        expect(transformMsg(clearData)).to.deep.equal(msg.subarray(1));
      }
    });
  });

  it('adds an empty encrypted chunk as end of stream chunk', async () => {
    const msg = utils.fromString('message');

    const encryptedChunkSize = msg.length + EncryptionV11.chunkOverhead;

    const stream = makeEncryptionStream(encryptedChunkSize);
    const sync = watchStream(stream);

    // push msg twice
    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(4);
    const compositeResourceId = unserializeCompositeResourceId(utils.fromBase64(stream.resourceId));
    const resourceKey = deriveSessionKey(key, compositeResourceId.resourceId);

    // skip header chunk
    buffer.slice(1).forEach((val, index, data) => {
      const eos = data.length - 1;
      const clearData = EncryptionV11.decryptChunk(resourceKey, index, {
        sessionId,
        resourceId: compositeResourceId.resourceId,
        encryptedChunkSize,
      }, val);

      if (index !== eos) {
        expect(val.length).to.equal(encryptedChunkSize);
        expect(transformMsg(clearData)).to.deep.equal(msg);
      } else {
        // empty last chunk
        expect(val.length).to.be.lt(encryptedChunkSize);
        expect(transformMsg(clearData)).to.deep.equal(new Uint8Array());
      }
    });
  });

  const coef = 3;
  describe(`buffers at most ${coef} * clear chunk size`, () => {
    [10, 50, 100, 1000].forEach(chunkSize => {
      it(`supports back pressure when piped to a slow writable with ${chunkSize} bytes input chunks`, async () => {
        const chunk = new Uint8Array(chunkSize);
        const inputSize = 10 * chunkSize;
        const bufferCounter = new BufferingObserver();
        const encryptionStream = makeEncryptionStream(chunkSize + EncryptionV11.chunkOverhead);
        const timeout = makeTimeoutPromise(50);
        const slowWritable = new Writable({
          highWaterMark: 1,
          objectMode: true,
          write: async (data, _, done) => {
            await timeout.promise;
            bufferCounter.incrementOutputAndSnapshot(data.length - EncryptionV11.chunkOverhead);
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
            `buffered data exceeds threshold (${coef} * chunk size + overhead): got ${bufferedLength}, chunk size ${chunkSize}, overhead: ${EncryptionV11.overhead})`,
          );
        });
      });
    });
  });
});
