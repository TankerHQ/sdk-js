import { expect } from '@tanker/test-utils';

import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import * as encryptorV1 from '../EncryptionFormats/v1';
import * as encryptorV2 from '../EncryptionFormats/v2';
import * as encryptorV3 from '../EncryptionFormats/v3';
import * as encryptorV5 from '../EncryptionFormats/v5';
import * as encryptorV6 from '../EncryptionFormats/v6';
import * as encryptorV7 from '../EncryptionFormats/v7';
import { Padding, getPaddedSize, minimalPadding } from '../padding';
import { ready as cryptoReady } from '../ready';

describe('Simple Encryption', () => {
  const clearData = utils.fromString('this is very secret');

  const key = new Uint8Array([
    0x76, 0xd, 0x8e, 0x80, 0x5c, 0xbc, 0xa8, 0xb6, 0xda, 0xea, 0xcf, 0x66,
    0x46, 0xca, 0xd7, 0xeb, 0x4f, 0x3a, 0xbc, 0x69, 0xac, 0x9b, 0xce, 0x77,
    0x35, 0x8e, 0xa8, 0x31, 0xd7, 0x2f, 0x14, 0xdd,
  ]);

  const testVectorV1 = new Uint8Array([
    // version
    0x01,
    // encrypted data
    0xc9, 0x5d, 0xe6, 0xa, 0x34, 0xb2, 0x89, 0x42, 0x7a, 0x6d, 0xda, 0xd7,
    0x7b, 0xa4, 0x58, 0xa7, 0xbf, 0xc8, 0x4f,
    // mac
    0xf5, 0x52, 0x9e, 0x12, 0x4, 0x9d, 0xfc, 0xaa, 0x83, 0xb0, 0x71, 0x59,
    0x91, 0xfb, 0xaa, 0xe2,
    // iv
    0x6d, 0x4b, 0x1, 0x7, 0xdc, 0xce, 0xd9, 0xcc, 0xc4, 0xad, 0xdf, 0x89,
    0x7b, 0x86, 0xe, 0x14, 0x22, 0x56, 0x3c, 0x43, 0x16, 0x97, 0x9a, 0x68,
  ]);

  const testVectorV2 = new Uint8Array([
    // version
    0x02,
    // iv
    0x32, 0x93, 0xa3, 0xf8, 0x6c, 0xa8, 0x82, 0x25, 0xbc, 0x17, 0x7e, 0xb5,
    0x65, 0x9b, 0xee, 0xd, 0xfd, 0xcf, 0xc6, 0x5c, 0x6d, 0xb4, 0x72, 0xe0,
    // encrypted data
    0x5b, 0x33, 0x27, 0x4c, 0x83, 0x84, 0xd1, 0xad, 0xda, 0x5f, 0x86, 0x2,
    0x46, 0x42, 0x91, 0x71, 0x30, 0x65, 0x2e,
    // mac
    0x72, 0x47, 0xe6, 0x48, 0x20, 0xa1, 0x86, 0x91, 0x7f, 0x9c, 0xb5, 0x5e,
    0x91, 0xb3, 0x65, 0x2d,
  ]);

  const testVectorV3 = new Uint8Array([
    // version
    0x03,
    // encrypted data
    0x37, 0xb5, 0x3d, 0x55, 0x34, 0xb5, 0xc1, 0x3f, 0xe3, 0x72, 0x81, 0x47,
    0xf0, 0xca, 0xda, 0x29, 0x99, 0x6e, 0x4,
    // mac
    0xa8, 0x41, 0x81, 0xa0, 0xe0, 0x5e, 0x8e, 0x3a, 0x8, 0xd3, 0x78, 0xfa,
    0x5, 0x9f, 0x17, 0xfa,
  ]);

  const testVectorV5 = new Uint8Array([
    // version
    0x05,
    // resourceId
    0xc1, 0x74, 0x53, 0x1e, 0xdd, 0x77, 0x77, 0x87, 0x2c, 0x02, 0x6e, 0xf2,
    0x36, 0xdf, 0x28, 0x7e,
    // iv
    0x70, 0xea, 0xb6, 0xe7, 0x72, 0x7d, 0xdd, 0x42, 0x5d, 0xa1, 0xab, 0xb3,
    0x6e, 0xd1, 0x8b, 0xea, 0xd7, 0xf5, 0xad, 0x23, 0xc0, 0xbd, 0x8c, 0x1f,
    // encrypted data
    0x68, 0xc7, 0x9e, 0xf2, 0xe9, 0xd8, 0x9e, 0xf9, 0x7e, 0x93, 0xc4, 0x29,
    0x0d, 0x96, 0x40, 0x2d, 0xbc, 0xf8, 0x0b,
    //mac
    0xb8, 0x4f, 0xfc, 0x48, 0x9b, 0x83, 0xd1, 0x05, 0x51, 0x40, 0xfc, 0xc2,
    0x7f, 0x6e, 0xd9, 0x16,
  ]);

  const testVectorV6 = new Uint8Array([
    // version
    0x06,
    // encrypted data
    0x37, 0xb5, 0x3d, 0x55, 0x34, 0xb5, 0xc1, 0x3f, 0xe3, 0x72, 0x81, 0x47,
    0xf0, 0xca, 0xda, 0x29, 0x99, 0x6e, 0x4, 0x3e,
    // mac
    0x06, 0x35, 0x7e, 0xb4, 0x72, 0x4f, 0x5b, 0x2d, 0x66, 0xfe, 0x0a, 0x95,
    0xba, 0x66, 0x04, 0x30,
  ]);

  const testVectorV7 = new Uint8Array([
    // version
    0x07,
    // resourceId
    0xc1, 0x74, 0x53, 0x1e, 0xdd, 0x77, 0x77, 0x87, 0x2c, 0x02, 0x6e, 0xf2,
    0x36, 0xdf, 0x28, 0x7e,
    // iv
    0xfe, 0x6f, 0xae, 0x05, 0xd7, 0xc1, 0x7c, 0xf2, 0x4c, 0x20, 0x91, 0xc1,
    0xb7, 0xe7, 0xbc, 0x95, 0x15, 0xf0, 0x61, 0xe7, 0x03, 0x0b, 0x52, 0xe0,
    // encrypted data
    0x05, 0x7c, 0x40, 0x68, 0x8f, 0x22, 0x89, 0xcf, 0x24, 0xe5, 0xa6, 0x88,
    0x6d, 0xdf, 0xbf, 0xe4, 0xab, 0x24, 0x92, 0xf9,
    // mac
    0x8f, 0x02, 0xbe, 0xa0, 0x80, 0xa4, 0x49, 0x5a, 0x9a, 0x03, 0xaa, 0x5b,
    0x6a, 0x47, 0x6f, 0x05,
  ]);

  const tamperWith = (data: Uint8Array): Uint8Array => {
    const bytePosition = Math.floor(Math.random() * data.length);
    const tamperedData = new Uint8Array(data);
    tamperedData[bytePosition] = (tamperedData[bytePosition]! + 1) % 256;
    return tamperedData;
  };

  before(() => cryptoReady);

  describe('EncryptionFormatV1', () => {
    it('should unserialize a test vector', () => {
      const unserializedData = encryptorV1.unserialize(testVectorV1);
      expect(unserializedData.iv).to.deep.equal(new Uint8Array([0x6d, 0x4b, 0x1, 0x7, 0xdc, 0xce, 0xd9, 0xcc, 0xc4, 0xad, 0xdf, 0x89, 0x7b, 0x86, 0xe, 0x14, 0x22, 0x56, 0x3c, 0x43, 0x16, 0x97, 0x9a, 0x68]));
      expect(unserializedData.encryptedData).to.deep.equal(new Uint8Array([0xc9, 0x5d, 0xe6, 0xa, 0x34, 0xb2, 0x89, 0x42, 0x7a, 0x6d, 0xda, 0xd7, 0x7b, 0xa4, 0x58, 0xa7, 0xbf, 0xc8, 0x4f, 0xf5, 0x52, 0x9e, 0x12, 0x4, 0x9d, 0xfc, 0xaa, 0x83, 0xb0, 0x71, 0x59, 0x91, 0xfb, 0xaa, 0xe2]));
      expect(unserializedData.resourceId).to.deep.equal(new Uint8Array([0xc4, 0xad, 0xdf, 0x89, 0x7b, 0x86, 0xe, 0x14, 0x22, 0x56, 0x3c, 0x43, 0x16, 0x97, 0x9a, 0x68]));
    });

    it('should unserialize/serialize a test vector', () => {
      const reserializedData = encryptorV1.serialize(encryptorV1.unserialize(testVectorV1));
      expect(reserializedData).to.deep.equal(testVectorV1);
    });

    it('should throw if trying to decrypt a corrupted buffer v1', () => {
      expect(() => encryptorV1.decrypt(key, encryptorV1.unserialize(tamperWith(testVectorV1)))).to.throw();
    });

    it('should encrypt / decrypt a buffer', () => {
      const encryptedData = encryptorV1.encrypt(key, clearData);
      const decryptedData = encryptorV1.decrypt(key, encryptedData);
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should decrypt a buffer v1', () => {
      const decryptedData = encryptorV1.decrypt(key, encryptorV1.unserialize(testVectorV1));
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should extract the resource id', () => {
      const resourceId = encryptorV1.extractResourceId(testVectorV1);
      expect(resourceId).to.deep.equal(new Uint8Array([0xc4, 0xad, 0xdf, 0x89, 0x7b, 0x86, 0xe, 0x14, 0x22, 0x56, 0x3c, 0x43, 0x16, 0x97, 0x9a, 0x68]));
    });

    it('should output the right resourceId', () => {
      const encryptedData = encryptorV1.encrypt(key, clearData);
      const buff = encryptorV1.serialize(encryptedData);
      expect(encryptorV1.extractResourceId(buff)).to.deep.equal(encryptedData.resourceId);
    });

    it('should compute clear and encrypted sizes', () => {
      const { overhead, getClearSize, getEncryptedSize } = encryptorV1;
      const clearSize = getClearSize(testVectorV1.length);
      const encryptedSize = getEncryptedSize(clearData.length);
      expect(clearSize).to.equal(clearData.length);
      expect(encryptedSize).to.equal(testVectorV1.length);
      expect(encryptedSize - clearSize).to.equal(overhead);
    });
  });

  describe('EncryptionFormatV2', () => {
    it('should unserialize a test vector', () => {
      const unserializedData = encryptorV2.unserialize(testVectorV2);
      expect(unserializedData.resourceId).to.deep.equal(new Uint8Array([0x72, 0x47, 0xe6, 0x48, 0x20, 0xa1, 0x86, 0x91, 0x7f, 0x9c, 0xb5, 0x5e, 0x91, 0xb3, 0x65, 0x2d]));
      expect(unserializedData.iv).to.deep.equal(new Uint8Array([0x32, 0x93, 0xa3, 0xf8, 0x6c, 0xa8, 0x82, 0x25, 0xbc, 0x17, 0x7e, 0xb5, 0x65, 0x9b, 0xee, 0xd, 0xfd, 0xcf, 0xc6, 0x5c, 0x6d, 0xb4, 0x72, 0xe0]));
      expect(unserializedData.encryptedData).to.deep.equal(new Uint8Array([0x5b, 0x33, 0x27, 0x4c, 0x83, 0x84, 0xd1, 0xad, 0xda, 0x5f, 0x86, 0x2, 0x46, 0x42, 0x91, 0x71, 0x30, 0x65, 0x2e, 0x72, 0x47, 0xe6, 0x48, 0x20, 0xa1, 0x86, 0x91, 0x7f, 0x9c, 0xb5, 0x5e, 0x91, 0xb3, 0x65, 0x2d]));
    });

    it('should unserialize/serialize a test vector', () => {
      const reserializedData = encryptorV2.serialize(encryptorV2.unserialize(testVectorV2));
      expect(reserializedData).to.deep.equal(testVectorV2);
    });

    it('should throw if trying to decrypt a corrupted buffer v2', () => {
      expect(() => encryptorV2.decrypt(key, encryptorV2.unserialize(tamperWith(testVectorV2)))).to.throw();
    });

    it('should encrypt / decrypt a buffer', () => {
      const encryptedData = encryptorV2.encrypt(key, clearData);
      const decryptedData = encryptorV2.decrypt(key, encryptedData);
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should decrypt a buffer v2', () => {
      const decryptedData = encryptorV2.decrypt(key, encryptorV2.unserialize(testVectorV2));
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should extract the resource id', () => {
      const resourceId = encryptorV2.extractResourceId(testVectorV2);
      expect(resourceId).to.deep.equal(new Uint8Array([0x72, 0x47, 0xe6, 0x48, 0x20, 0xa1, 0x86, 0x91, 0x7f, 0x9c, 0xb5, 0x5e, 0x91, 0xb3, 0x65, 0x2d]));
    });

    it('should output the right resourceId', () => {
      const encryptedData = encryptorV2.encrypt(key, clearData);
      const buff = encryptorV2.serialize(encryptedData);
      expect(encryptorV2.extractResourceId(buff)).to.deep.equal(encryptedData.resourceId);
    });

    it('should compute clear and encrypted sizes', () => {
      const { overhead, getClearSize, getEncryptedSize } = encryptorV2;
      const clearSize = getClearSize(testVectorV2.length);
      const encryptedSize = getEncryptedSize(clearData.length);
      expect(clearSize).to.equal(clearData.length);
      expect(encryptedSize).to.equal(testVectorV2.length);
      expect(encryptedSize - clearSize).to.equal(overhead);
    });
  });

  describe('EncryptionFormatV3', () => {
    it('should unserialize a test vector', () => {
      const unserializedData = encryptorV3.unserialize(testVectorV3);
      expect(unserializedData.encryptedData).to.deep.equal(new Uint8Array([0x37, 0xb5, 0x3d, 0x55, 0x34, 0xb5, 0xc1, 0x3f, 0xe3, 0x72, 0x81, 0x47, 0xf0, 0xca, 0xda, 0x29, 0x99, 0x6e, 0x4, 0xa8, 0x41, 0x81, 0xa0, 0xe0, 0x5e, 0x8e, 0x3a, 0x8, 0xd3, 0x78, 0xfa, 0x5, 0x9f, 0x17, 0xfa]));
      expect(unserializedData.resourceId).to.deep.equal(new Uint8Array([0xa8, 0x41, 0x81, 0xa0, 0xe0, 0x5e, 0x8e, 0x3a, 0x8, 0xd3, 0x78, 0xfa, 0x5, 0x9f, 0x17, 0xfa]));
      expect(unserializedData.iv).to.deep.equal(new Uint8Array(24)); // zeros
    });

    it('should unserialize/serialize a test vector', () => {
      const reserializedData = encryptorV3.serialize(encryptorV3.unserialize(testVectorV3));
      expect(reserializedData).to.deep.equal(testVectorV3);
    });

    it('should throw if trying to decrypt a corrupted buffer v3', () => {
      expect(() => encryptorV3.decrypt(key, encryptorV3.unserialize(tamperWith(testVectorV3)))).to.throw();
    });

    it('should encrypt / decrypt a buffer', () => {
      const encryptedData = encryptorV3.encrypt(key, clearData);
      const decryptedData = encryptorV3.decrypt(key, encryptedData);
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should decrypt a buffer v3', () => {
      const decryptedData = encryptorV3.decrypt(key, encryptorV3.unserialize(testVectorV3));
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should extract the resource id', () => {
      const resourceId = encryptorV3.extractResourceId(testVectorV3);
      expect(resourceId).to.deep.equal(new Uint8Array([0xa8, 0x41, 0x81, 0xa0, 0xe0, 0x5e, 0x8e, 0x3a, 0x8, 0xd3, 0x78, 0xfa, 0x5, 0x9f, 0x17, 0xfa]));
    });

    it('should output the right resourceId', () => {
      const encryptedData = encryptorV3.encrypt(key, clearData);
      const buff = encryptorV3.serialize(encryptedData);
      expect(encryptorV3.extractResourceId(buff)).to.deep.equal(encryptedData.resourceId);
    });

    it('should compute clear and encrypted sizes', () => {
      const { overhead, getClearSize, getEncryptedSize } = encryptorV3;
      const clearSize = getClearSize(testVectorV3.length);
      const encryptedSize = getEncryptedSize(clearData.length);
      expect(clearSize).to.equal(clearData.length);
      expect(encryptedSize).to.equal(testVectorV3.length);
      expect(encryptedSize - clearSize).to.equal(overhead);
    });
  });

  describe('EncryptionFormatV5', () => {
    const resourceId = random(tcrypto.MAC_SIZE);

    it('should unserialize a test vector', () => {
      const unserializedData = encryptorV5.unserialize(testVectorV5);
      expect(unserializedData.encryptedData).to.deep.equal(new Uint8Array([
        0x68, 0xc7, 0x9e, 0xf2, 0xe9, 0xd8, 0x9e, 0xf9, 0x7e, 0x93, 0xc4, 0x29,
        0x0d, 0x96, 0x40, 0x2d, 0xbc, 0xf8, 0x0b,
        0xb8, 0x4f, 0xfc, 0x48, 0x9b, 0x83, 0xd1, 0x05, 0x51, 0x40, 0xfc, 0xc2,
        0x7f, 0x6e, 0xd9, 0x16,
      ]));
      expect(unserializedData.resourceId).to.deep.equal(new Uint8Array([
        0xc1, 0x74, 0x53, 0x1e, 0xdd, 0x77, 0x77, 0x87, 0x2c, 0x02, 0x6e, 0xf2,
        0x36, 0xdf, 0x28, 0x7e,
      ]));
      expect(unserializedData.iv).to.deep.equal(new Uint8Array([
        0x70, 0xea, 0xb6, 0xe7, 0x72, 0x7d, 0xdd, 0x42, 0x5d, 0xa1, 0xab, 0xb3,
        0x6e, 0xd1, 0x8b, 0xea, 0xd7, 0xf5, 0xad, 0x23, 0xc0, 0xbd, 0x8c, 0x1f,
      ]));
    });

    it('should decrypt a test vector v5', () => {
      const decryptedData = encryptorV5.decrypt(key, encryptorV5.unserialize(testVectorV5));
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should encrypt / decrypt a buffer', () => {
      const encryptedData = encryptorV5.encrypt(key, clearData, resourceId);
      const decryptedData = encryptorV5.decrypt(key, encryptedData);
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should serialize/unserialize a buffer', () => {
      const data = encryptorV5.encrypt(key, clearData, resourceId);
      const buffer = encryptorV5.serialize(data);
      const unserializedData = encryptorV5.unserialize(buffer);

      expect(unserializedData.resourceId).to.deep.equal(resourceId);
      expect(unserializedData.encryptedData).to.deep.equal(data.encryptedData);
      expect(unserializedData.iv).to.deep.equal(data.iv);
    });

    it('should throw if trying to decrypt a corrupted buffer', () => {
      const buffer = encryptorV5.serialize(encryptorV5.encrypt(key, clearData, resourceId));
      expect(() => encryptorV5.decrypt(key, encryptorV5.unserialize(tamperWith(buffer)))).to.throw();
    });

    it('should extract the resource id', () => {
      const extractedResourceId = encryptorV5.extractResourceId(testVectorV5);
      expect(extractedResourceId).to.deep.equal(new Uint8Array([0xc1, 0x74, 0x53, 0x1e, 0xdd, 0x77, 0x77, 0x87, 0x2c, 0x02, 0x6e, 0xf2, 0x36, 0xdf, 0x28, 0x7e]));
    });

    it('should compute clear and encrypted sizes', () => {
      const { overhead, getClearSize, getEncryptedSize } = encryptorV5;
      const clearSize = getClearSize(testVectorV5.length);
      const encryptedSize = getEncryptedSize(clearData.length);
      expect(clearSize).to.equal(clearData.length);
      expect(encryptedSize).to.equal(testVectorV5.length);
      expect(encryptedSize - clearSize).to.equal(overhead);
    });
  });

  describe('EncryptionFormatV6', () => {
    const v6ResourceId = new Uint8Array([0x6, 0x35, 0x7e, 0xb4, 0x72, 0x4f, 0x5b, 0x2d, 0x66, 0xfe, 0xa, 0x95, 0xba, 0x66, 0x4, 0x30]);
    const overhead = encryptorV6.overhead;

    it('unserializes a test vector', () => {
      const unserializedData = encryptorV6.unserialize(testVectorV6);
      expect(unserializedData.encryptedData).to.deep.equal(new Uint8Array([0x37, 0xb5, 0x3d, 0x55, 0x34, 0xb5, 0xc1, 0x3f, 0xe3, 0x72, 0x81, 0x47, 0xf0, 0xca, 0xda, 0x29, 0x99, 0x6e, 0x4, 0x3e, 0x06, 0x35, 0x7e, 0xb4, 0x72, 0x4f, 0x5b, 0x2d, 0x66, 0xfe, 0x0a, 0x95, 0xba, 0x66, 0x04, 0x30]));
      expect(unserializedData.resourceId).to.deep.equal(v6ResourceId);
      expect(unserializedData.iv).to.deep.equal(new Uint8Array(24)); // zeros
    });

    it('unserializes/serializes a test vector', () => {
      const reserializedData = encryptorV6.serialize(encryptorV6.unserialize(testVectorV6));
      expect(reserializedData).to.deep.equal(testVectorV6);
    });

    it('throws if trying to decrypt a corrupted buffer v6', () => {
      expect(() => encryptorV6.decrypt(key, encryptorV6.unserialize(tamperWith(testVectorV6)))).to.throw();
    });

    it('decrypts a buffer v6', () => {
      const decryptedData = encryptorV6.decrypt(key, encryptorV6.unserialize(testVectorV6));
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('extracts the resource id', () => {
      const resourceId = encryptorV6.extractResourceId(testVectorV6);
      expect(resourceId).to.deep.equal(v6ResourceId);
    });

    it('computes clear and encrypted sizes', () => {
      const { getClearSize, getEncryptedSize } = encryptorV6;
      const encryptedSize = getEncryptedSize(clearData.length);
      const paddedClearSize = getPaddedSize(clearData.length);
      const decrypedSize = getClearSize(testVectorV6.length);

      expect(encryptedSize).to.equal(testVectorV6.length);
      expect(paddedClearSize + overhead).to.equal(encryptedSize);
      expect(decrypedSize).to.greaterThanOrEqual(clearData.length);
    });

    [undefined, 2, 5, 13].forEach(paddingStep => {
      it(`outputs the right resourceId for a paddingStep of ${paddingStep}`, () => {
        const encryptedData = encryptorV6.encrypt(key, clearData, paddingStep);
        const buff = encryptorV6.serialize(encryptedData);
        expect(encryptorV6.extractResourceId(buff)).to.deep.equal(encryptedData.resourceId);
      });
    });

    it('computes the exact encrypted size for multiple padding steps', () => {
      const paddedToFive: Array<[number, number]> = [
        [0, 5],
        [2, 5],
        [4, 5],
        [5, 10],
        [6, 10],
        [9, 10],
        [10, 15],
        [14, 15],
        [39, 40],
        [40, 45],
        [41, 45],
      ];

      paddedToFive.forEach(tuple => {
        const [clearSize, paddedSize] = tuple;
        expect(encryptorV6.getEncryptedSize(clearSize, 5)).to.equal(paddedSize + overhead);
      });
    });

    it('throws if getEncryptedSize is called with an invalid paddingStep', () => {
      const clearSize = clearData.length;
      expect(() => encryptorV6.getEncryptedSize(clearSize, 0)).to.throw;
      expect(() => encryptorV6.getEncryptedSize(clearSize, 1)).to.throw;
    });

    it('throws if encrypt is called with an invalid paddingStep', () => {
      expect(() => encryptorV6.encrypt(key, clearData, 0)).to.throw;
      expect(() => encryptorV6.encrypt(key, clearData, 1)).to.throw;
    });

    const emptyClearData = new Uint8Array(0);
    const smallClearData = utils.fromString('small');
    const mediumClearData = clearData;

    [emptyClearData, smallClearData, mediumClearData].forEach(clear => {
      const clearLength = clear.length;

      [2, 3, 7, 13, 19].forEach(step => {
        it(`can set a padding of ${step} for a ${clearLength} byte(s) buffer`, () => {
          const encrypted = encryptorV6.serialize(encryptorV6.encrypt(key, clear, step));
          const paddedLength = encrypted.length - overhead;
          expect(paddedLength).to.greaterThanOrEqual(step);
          expect(paddedLength % step).to.equal(0);

          const decrypted = encryptorV6.decrypt(key, encryptorV6.unserialize(encrypted));
          expect(decrypted).to.deep.equal(clear);
        });
      });

      [undefined, Padding.AUTO].forEach(step => {
        it(`supports auto padding as ${step} for a ${clearLength} byte(s) buffer`, () => {
          const encrypted = encryptorV6.serialize(encryptorV6.encrypt(key, clear, step));
          const paddedLength = encrypted.length - overhead;
          expect(paddedLength).to.greaterThanOrEqual(minimalPadding);
          expect(paddedLength).to.greaterThanOrEqual(clearLength + 1);

          const decrypted = encryptorV6.decrypt(key, encryptorV6.unserialize(encrypted));
          expect(decrypted).to.deep.equal(clear);
        });
      });
    });
  });

  describe('EncryptionFormatV7', () => {
    const resourceId = random(tcrypto.MAC_SIZE);

    it('should unserialize a test vector', () => {
      const unserializedData = encryptorV7.unserialize(testVectorV7);
      expect(unserializedData.encryptedData).to.deep.equal(new Uint8Array([
        0x05, 0x7c, 0x40, 0x68, 0x8f, 0x22, 0x89, 0xcf, 0x24, 0xe5, 0xa6, 0x88,
        0x6d, 0xdf, 0xbf, 0xe4, 0xab, 0x24, 0x92, 0xf9, 0x8f, 0x02, 0xbe, 0xa0,
        0x80, 0xa4, 0x49, 0x5a, 0x9a, 0x03, 0xaa, 0x5b, 0x6a, 0x47, 0x6f, 0x05,
      ]));
      expect(unserializedData.resourceId).to.deep.equal(new Uint8Array([
        0xc1, 0x74, 0x53, 0x1e, 0xdd, 0x77, 0x77, 0x87, 0x2c, 0x02, 0x6e, 0xf2,
        0x36, 0xdf, 0x28, 0x7e,
      ]));
      expect(unserializedData.iv).to.deep.equal(new Uint8Array([
        0xfe, 0x6f, 0xae, 0x05, 0xd7, 0xc1, 0x7c, 0xf2, 0x4c, 0x20, 0x91, 0xc1,
        0xb7, 0xe7, 0xbc, 0x95, 0x15, 0xf0, 0x61, 0xe7, 0x03, 0x0b, 0x52, 0xe0,
      ]));
    });

    it('should decrypt a test vector v7', () => {
      const decryptedData = encryptorV7.decrypt(key, encryptorV7.unserialize(testVectorV7));
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should encrypt / decrypt a buffer', () => {
      const encryptedData = encryptorV7.encrypt(key, clearData, resourceId);
      const decryptedData = encryptorV7.decrypt(key, encryptedData);
      expect(decryptedData).to.deep.equal(clearData);
    });

    it('should serialize/unserialize a buffer', () => {
      const data = encryptorV7.encrypt(key, clearData, resourceId);
      const buffer = encryptorV7.serialize(data);
      const unserializedData = encryptorV7.unserialize(buffer);

      expect(unserializedData.resourceId).to.deep.equal(resourceId);
      expect(unserializedData.encryptedData).to.deep.equal(data.encryptedData);
      expect(unserializedData.iv).to.deep.equal(data.iv);
    });

    it('should throw if trying to decrypt a corrupted buffer', () => {
      const buffer = encryptorV7.serialize(encryptorV7.encrypt(key, clearData, resourceId));
      expect(() => encryptorV7.decrypt(key, encryptorV7.unserialize(tamperWith(buffer)))).to.throw();
    });

    it('should extract the resource id', () => {
      const extractedResourceId = encryptorV7.extractResourceId(testVectorV7);
      expect(extractedResourceId).to.deep.equal(new Uint8Array([0xc1, 0x74, 0x53, 0x1e, 0xdd, 0x77, 0x77, 0x87, 0x2c, 0x02, 0x6e, 0xf2, 0x36, 0xdf, 0x28, 0x7e]));
    });

    it('should compute clear and encrypted sizes', () => {
      const { overhead, getClearSize, getEncryptedSize } = encryptorV7;
      const clearSize = getClearSize(testVectorV7.length);
      const encryptedSize = getEncryptedSize(clearData.length);
      // add one to include the padding byte
      expect(clearSize + 1).to.equal(getPaddedSize(clearData.length));
      expect(encryptedSize).to.equal(testVectorV7.length);
      // encryptorv7.overhead does not include the padding byte
      expect(encryptedSize - clearSize).to.equal(overhead + 1);
    });
  });
});
