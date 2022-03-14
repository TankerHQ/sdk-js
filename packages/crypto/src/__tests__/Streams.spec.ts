import { expect } from '@tanker/test-utils';
import { MergerStream, SlicerStream } from '@tanker/stream-base';
import { DecryptionFailed } from '@tanker/errors';

import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as encryptorV4 from '../EncryptionFormats/v4';
import { EncryptionStreamV4 } from '../EncryptionFormats/EncryptionStreamV4';
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
const overhead = encryptorV4.overhead;
const smallClearChunkSize = smallChunkSize - overhead;

describe('Stream Encryption', () => {
  before(() => cryptoReady);

  const generateSmallChunkTest = (bufferSize: number) => {
    it(`Encrypt/decrypt with small chunks and size of ${bufferSize}`, async () => {
      const buffer = random(bufferSize);
      const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

      const encrypted = await processWithStream(() => new EncryptionStreamV4(random(tcrypto.MAC_SIZE), key, smallChunkSize), buffer);
      const decrypted = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted);

      expect(decrypted).to.deep.equal(buffer);
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

    const encrypted = await processWithStream(() => new EncryptionStreamV4(random(tcrypto.MAC_SIZE), key), buffer);
    const decrypted = await processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted);

    expect(decrypted).to.deep.equal(buffer);
  });

  it('different headers between chunks', async () => {
    const buffer = random(16);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => new EncryptionStreamV4(random(tcrypto.MAC_SIZE), key, smallChunkSize), buffer);
    // change the resource id in the second header
    encrypted[smallChunkSize + 1 + 4] -= 1;
    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), encrypted)).to.be.rejectedWith(DecryptionFailed);
  });

  it('wrong chunk order', async () => {
    // Takes exactly 2 chunks + 1 empty chunk
    const buffer = random(18);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => new EncryptionStreamV4(random(tcrypto.MAC_SIZE), key, smallChunkSize), buffer);
    const corrupted = new Uint8Array(encrypted);
    // Swap the first two chunks
    corrupted.set(encrypted.slice(smallChunkSize, 2 * smallChunkSize), 0);
    corrupted.set(encrypted.slice(0, smallChunkSize), smallChunkSize);

    await expect(processWithStream(() => new DecryptionStream({ findKey: async () => key }), corrupted)).to.be.rejectedWith(DecryptionFailed);
  });

  it('invalid encryptedChunkSize', async () => {
    const buffer = random(16);
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encrypted = await processWithStream(() => new EncryptionStreamV4(random(tcrypto.MAC_SIZE), key, smallChunkSize), buffer);

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
});
