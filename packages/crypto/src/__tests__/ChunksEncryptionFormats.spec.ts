import { expect } from '@tanker/test-utils';

import * as utils from '../utils';
import * as encryptorV4 from '../EncryptionFormats/v4';
import { ready as cryptoReady } from '../ready';

const testMessage = utils.fromString('this is a secret');
const encryptedChunkSize = 70;

const chunk1 = new Uint8Array([
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
]);

const chunk2 = new Uint8Array([
  // version
  0x4,
  // encrypted chunk size
  0x46, 0, 0, 0,
  // resource id
  0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b, 0x27, 0x32, 0xc9, 0xa, 0x1e,
  0xc6, 0x8f, 0x2b, 0xdb,
  // iv seed
  0x3f, 0x34, 0xf3, 0xd3, 0x23, 0x90, 0xfc, 0x6, 0x35, 0xda, 0x99, 0x1e,
  0x81, 0xdf, 0x88, 0xfc, 0x21, 0x1e, 0xed, 0x3a, 0x28, 0x2d, 0x51, 0x82,
  // encrypted data + mac
  0x77, 0x7c, 0xf6, 0xbe, 0x54, 0xd4, 0x92, 0xcd, 0x86, 0xd4, 0x88, 0x55,
  0x20, 0x1f, 0xd6, 0x44, 0x47, 0x30, 0x40, 0x2f, 0xe8, 0xf4, 0x50,
]);

const key = new Uint8Array([
  0xa, 0x7, 0x3d, 0xd0, 0x2c, 0x2d, 0x17, 0xf9, 0x49, 0xd9, 0x35, 0x8e,
  0xf7, 0xfe, 0x7b, 0xd1, 0xf6, 0xb, 0xf1, 0x5c, 0xa4, 0x32, 0x1e, 0xe4,
  0xaa, 0x18, 0xe1, 0x97, 0xbf, 0xf4, 0x5e, 0xfe,
]);

const resourceId = new Uint8Array([
  0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b, 0x27, 0x32, 0xc9, 0xa, 0x1e,
  0xc6, 0x8f, 0x2b, 0xdb,
]);

const truncate = (data: Uint8Array): Uint8Array => {
  const end = Math.floor(Math.random() * (data.length - 1));
  return data.subarray(0, end);
};

describe('Encryption V4', () => {
  before(() => cryptoReady);

  it('can unserialize a test vector', async () => {
    const unserializedData = encryptorV4.unserialize(chunk1);
    expect(unserializedData.encryptedChunkSize).to.equal(encryptedChunkSize);
    expect(unserializedData.encryptedData).to.deep.equal(new Uint8Array([0xe3, 0x9a, 0x4, 0x22, 0x67, 0x3d, 0xdf, 0xcf, 0x28, 0x48, 0xe2, 0xeb, 0x4b, 0xb4, 0x30, 0x92, 0x70, 0x23, 0x49, 0x1c, 0xc9, 0x31, 0xcb, 0xda, 0x1a]));
    expect(unserializedData.resourceId).to.deep.equal(resourceId);
    expect(unserializedData.ivSeed).to.deep.equal(new Uint8Array([0xcd, 0x7, 0xd0, 0x3a, 0xc8, 0x74, 0xe1, 0x8, 0x7e, 0x5e, 0xaa, 0xa2, 0x82, 0xd8, 0x8b, 0xf5, 0xed, 0x22, 0xe6, 0x30, 0xbb, 0xaa, 0x9d, 0x71]));
  });

  it('should unserialize/serialize a test vector', () => {
    const reserializedData = encryptorV4.serialize(encryptorV4.unserialize(chunk1));
    expect(reserializedData).to.deep.equal(chunk1);
  });

  it('should throw if trying to unserialize a truncated buffer v4', () => {
    expect(() => encryptorV4.decryptChunk(key, 0, encryptorV4.unserialize(truncate(chunk1)))).to.throw();
  });

  it('can decrypt a chunk', async () => {
    const clear = encryptorV4.decryptChunk(key, 0, encryptorV4.unserialize(chunk1));
    expect(clear).to.deep.equal(utils.fromString('this is a'));
  });

  it('can decrypt a chunk with derivation', async () => {
    const clear = encryptorV4.decryptChunk(key, 1, encryptorV4.unserialize(chunk2));
    expect(clear).to.deep.equal(utils.fromString(' secret'));
  });

  it('throws when the index is wrong', async () => {
    expect(() => {
      encryptorV4.decryptChunk(key, 0, encryptorV4.unserialize(chunk2));
    }).to.throw();
  });

  it('should encrypt / decrypt a buffer', () => {
    const encryptedData = encryptorV4.encryptChunk(key, 2, resourceId, encryptedChunkSize, testMessage);
    const decryptedData = encryptorV4.decryptChunk(key, 2, encryptedData);
    expect(decryptedData).to.deep.equal(testMessage);
  });

  it('should encrypt / decrypt an empty buffer', () => {
    const encryptedData = encryptorV4.serialize(encryptorV4.encryptChunk(key, 2, resourceId, encryptedChunkSize, new Uint8Array(0)));
    expect(encryptedData.length).to.equal(encryptorV4.overhead);

    const decryptedData = encryptorV4.decryptChunk(key, 2, encryptorV4.unserialize(encryptedData));
    expect(decryptedData).to.deep.equal(new Uint8Array(0));
  });

  it('should compute clear and encrypted sizes', () => {
    const { overhead, getClearSize, getEncryptedSize } = encryptorV4;
    const clearSize = getClearSize(chunk1.length + chunk2.length, encryptedChunkSize);
    const encryptedSize = getEncryptedSize(testMessage.length, encryptedChunkSize);
    expect(clearSize).to.equal(testMessage.length);
    expect(encryptedSize).to.equal(chunk1.length + chunk2.length);
    expect(encryptedSize - clearSize).to.equal(2 * overhead);
  });
});
