import { expect } from '@tanker/test-utils';
import { MergerStream, SlicerStream } from '@tanker/stream-base';
import { DecryptionFailed } from '@tanker/errors';

import { Padding } from '../padding';
import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as encryptorV4 from '../EncryptionFormats/v4';
import * as encryptorV8 from '../EncryptionFormats/v8';
import { EncryptionStreamV4 } from '../EncryptionFormats/EncryptionStreamV4';
import { EncryptionStreamV8 } from '../EncryptionFormats/EncryptionStreamV8';
import { DecryptionStream } from '../EncryptionFormats/DecryptionStream';
import { ready as cryptoReady } from '../ready';

const processWithStream = (streamFactory: Function, encryptedData: Uint8Array): Promise<Uint8Array> => {
  const slicer = new SlicerStream({ source: encryptedData });
  const processor = streamFactory();
  const merger = new MergerStream({ type: Uint8Array });

  return new Promise((resolve, reject) => {
    [slicer, processor, merger].forEach(s => s.on('error', reject));
    slicer.pipe(processor).pipe(merger).on('data', resolve);
  });
};

const smallChunkSize = 0x46;

const swapSecondChunk = (a: Uint8Array, b: Uint8Array) => {
  // make sure the test is correctly set up
  expect(a.length).to.equal(b.length);
  expect(a.length).to.be.greaterThan(2 * smallChunkSize);
  expect(a[1]).to.equal(smallChunkSize);

  const resourceIdA = a.subarray(5, 5 + 16);
  const resourceIdB = a.subarray(5, 5 + 16);

  expect(resourceIdA, 'for this to work, the buffers must use the same key and resource id').to.deep.equal(resourceIdB);

  const rangeA = a.subarray(smallChunkSize, 2 * smallChunkSize);
  const rangeB = b.subarray(smallChunkSize, 2 * smallChunkSize);

  const tmp = rangeA.slice();
  rangeA.set(rangeB);
  rangeB.set(tmp);
};

type TestParameters<T> = {
  makeEncryptionStream: ((resourceId: Uint8Array, key: Uint8Array, chunkSize?: number) => T);
  overhead: number;
};

const generateStreamEncryptionTests = <T>({ makeEncryptionStream, overhead }: TestParameters<T>) => {
  const smallClearChunkSize = smallChunkSize - overhead;

  before(() => cryptoReady);

  const generateSmallChunkTest = (bufferSize: number) => {
    it(`Encrypt/decrypt with small chunks and size of ${bufferSize}`, async () => {
      const buffer = random(bufferSize);
      const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

      const encrypted = await processWithStream(() => makeEncryptionStream(random(tcrypto.MAC_SIZE), key, smallChunkSize), buffer);
      const decrypted = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted);

      expect(decrypted).to.deep.equal(buffer);
      // @ts-expect-error getEncryptedSize exists, we need to extract an Encryptor interface to help TS here
      expect(makeEncryptionStream(random(tcrypto.MAC_SIZE), key, smallChunkSize).getEncryptedSize(buffer.length)).to.equal(encrypted.length);
    });
  };

  generateSmallChunkTest(0); // empty buffer
  generateSmallChunkTest(2); // single chunk
  generateSmallChunkTest(smallClearChunkSize + 2); // one chunk and a half
  generateSmallChunkTest(2 * smallClearChunkSize); // exactly 2 chunks (and one empty one)
  generateSmallChunkTest(300); // lots of chunks

  it('Encrypt/decrypt huge buffer', async () => {
    const buffer = new Uint8Array(24 + 5 * encryptorV4.defaultMaxEncryptedChunkSize);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => makeEncryptionStream(random(tcrypto.MAC_SIZE), key), buffer);
    const decrypted = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted);

    expect(decrypted).to.deep.equal(buffer);
  });

  it('different headers between chunks', async () => {
    const buffer = random(16);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => makeEncryptionStream(random(tcrypto.MAC_SIZE), key, smallChunkSize), buffer);
    // change the resource id in the second header
    encrypted[smallChunkSize + 1 + 4] -= 1;
    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted)).to.be.rejectedWith(DecryptionFailed);
  });

  it('wrong chunk order', async () => {
    // Takes exactly 2 chunks + 1 empty chunk
    const buffer = random(18);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => makeEncryptionStream(random(tcrypto.MAC_SIZE), key, smallChunkSize), buffer);
    const corrupted = new Uint8Array(encrypted);
    // Swap the first two chunks
    corrupted.set(encrypted.slice(smallChunkSize, 2 * smallChunkSize), 0);
    corrupted.set(encrypted.slice(0, smallChunkSize), smallChunkSize);

    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), corrupted)).to.be.rejectedWith(DecryptionFailed);
  });

  it('invalid encryptedChunkSize', async () => {
    const buffer = random(16);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => makeEncryptionStream(random(tcrypto.MAC_SIZE), key, smallChunkSize), buffer);

    // with an encryptedChunkSize too small

    const invalidSizeTestVector = new Uint8Array(encrypted);
    // set encryptedChunkSize to 2 in all chunks, less than the strict minimum
    invalidSizeTestVector[1] = 2;
    invalidSizeTestVector[smallChunkSize + 1] = 2;
    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), invalidSizeTestVector)).to.be.rejectedWith(DecryptionFailed);

    // with a corrupted encryptedChunkSize

    const smallSizeTestVector = new Uint8Array(encrypted);
    // set encryptedChunkSize to 69, but the chunk is originally of size 70
    smallSizeTestVector[1] = 69;
    smallSizeTestVector[smallChunkSize + 1] = 69;
    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), smallSizeTestVector)).to.be.rejectedWith(DecryptionFailed);
  });

  // Make sure our test helper works
  it('swapSecondChunk works', async () => {
    const buffer1 = random(2 * smallClearChunkSize);
    const buffer2 = random(2 * smallClearChunkSize);

    const resourceId = random(tcrypto.MAC_SIZE);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted1 = await processWithStream(() => makeEncryptionStream(resourceId, key, smallChunkSize), buffer1);
    const encrypted2 = await processWithStream(() => makeEncryptionStream(resourceId, key, smallChunkSize), buffer2);

    swapSecondChunk(encrypted1, encrypted2);

    const decrypted1 = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted1);
    const decrypted2 = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted2);

    expect(decrypted1.subarray(0, smallClearChunkSize)).to.deep.equal(buffer1.subarray(0, smallClearChunkSize));
    expect(decrypted1.subarray(smallClearChunkSize)).to.deep.equal(buffer2.subarray(smallClearChunkSize));

    expect(decrypted2.subarray(0, smallClearChunkSize)).to.deep.equal(buffer2.subarray(0, smallClearChunkSize));
    expect(decrypted2.subarray(smallClearChunkSize)).to.deep.equal(buffer1.subarray(smallClearChunkSize));
  });
};

describe('Stream Encryption V4', () => {
  generateStreamEncryptionTests({
    makeEncryptionStream: (resourceId: Uint8Array, key: Uint8Array, chunkSize?: number) => new EncryptionStreamV4(resourceId, key, chunkSize),
    overhead: encryptorV4.overhead,
  });
});
describe('Stream Encryption V8', () => {
  generateStreamEncryptionTests({
    makeEncryptionStream: (resourceId: Uint8Array, key: Uint8Array, chunkSize?: number) => new EncryptionStreamV8(resourceId, key, Padding.OFF, chunkSize),
    overhead: encryptorV8.overhead,
  });

  const smallClearChunkSize = smallChunkSize - encryptorV8.overhead;

  it('exactly 2 chunks including padding', async () => {
    const buffer = random(15);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => new EncryptionStreamV8(random(tcrypto.MAC_SIZE), key, Padding.AUTO, smallChunkSize), buffer);

    expect(encrypted.length).to.equal(2 * smallChunkSize + encryptorV8.overhead);

    const decrypted = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted);

    expect(decrypted).to.deep.equal(buffer);
  });

  it('exactly 2 chunks excluding padding', async () => {
    const buffer = random(16);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const paddingSize = 2;

    const encrypted = await processWithStream(() => new EncryptionStreamV8(random(tcrypto.MAC_SIZE), key, buffer.length + paddingSize, smallChunkSize), buffer);

    expect(encrypted.length).to.equal(2 * smallChunkSize + paddingSize + encryptorV8.overhead);

    const decrypted = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted);

    expect(decrypted).to.deep.equal(buffer);
  });

  it('multiple chunks of padding', async () => {
    const buffer = random(4);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => new EncryptionStreamV8(random(tcrypto.MAC_SIZE), key, 3 * smallClearChunkSize - 1, smallChunkSize), buffer);

    expect(encrypted.length).to.equal(3 * smallChunkSize - 1);

    const decrypted = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted);

    expect(decrypted).to.deep.equal(buffer);
  });

  it('multiple chunks of padding ending with empty chunk', async () => {
    const buffer = random(4);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => new EncryptionStreamV8(random(tcrypto.MAC_SIZE), key, 3 * smallClearChunkSize, smallChunkSize), buffer);

    expect(encrypted.length).to.equal(3 * smallChunkSize + encryptorV8.overhead);

    const decrypted = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted);

    expect(decrypted).to.deep.equal(buffer);
  });

  it('decrypting a truncated padding should fail', async () => {
    const buffer = random(4);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    let encrypted = await processWithStream(() => new EncryptionStreamV8(random(tcrypto.MAC_SIZE), key, 3 * smallClearChunkSize, smallChunkSize), buffer);

    expect(encrypted.length).to.equal(3 * smallChunkSize + encryptorV8.overhead);

    // truncate last chunk
    encrypted = encrypted.subarray(0, 3 * smallChunkSize);
    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted)).to.be.rejectedWith(DecryptionFailed);

    // truncate last two chunks
    encrypted = encrypted.subarray(0, 2 * smallChunkSize);
    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted)).to.be.rejectedWith(DecryptionFailed);
  });

  it('decrypt forged buffer with padding in middle of data', async () => {
    const buffer1 = random(3 * smallClearChunkSize);
    const buffer2 = random(1);

    const resourceId = random(tcrypto.MAC_SIZE);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted1 = await processWithStream(() => new EncryptionStreamV8(resourceId, key, 3 * smallClearChunkSize, smallChunkSize), buffer1);
    const encrypted2 = await processWithStream(() => new EncryptionStreamV8(resourceId, key, 3 * smallClearChunkSize, smallChunkSize), buffer2);

    // Make sure we got the math right, we should have 3 chunks + 1 empty chunk
    expect(encrypted1.length).to.equal(3 * smallChunkSize + encryptorV8.overhead);
    expect(encrypted2.length).to.equal(3 * smallChunkSize + encryptorV8.overhead);

    swapSecondChunk(encrypted1, encrypted2);

    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted1)).to.be.rejectedWith(DecryptionFailed, 'unable to remove padding');
    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted2)).to.be.rejectedWith(DecryptionFailed, 'unable to remove padding');
  });
});
