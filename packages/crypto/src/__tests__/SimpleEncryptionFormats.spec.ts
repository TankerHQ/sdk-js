import { expect } from '@tanker/test-utils';

import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import * as encryptorV1 from '../EncryptionFormats/v1';
import * as encryptorV2 from '../EncryptionFormats/v2';
import * as encryptorV3 from '../EncryptionFormats/v3';
import * as encryptorV5 from '../EncryptionFormats/v5';
import type { Encryptor } from '../EncryptionFormats/types';
import { ready as cryptoReady } from '../ready';

type TestVector = {
  key: Uint8Array,
  clearData: Uint8Array,
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
};

describe('Simple Encryption', () => {
  const testVectorsV1 = [{
    key: new Uint8Array([
      0x76, 0xd, 0x8e, 0x80, 0x5c, 0xbc, 0xa8, 0xb6, 0xda, 0xea, 0xcf, 0x66,
      0x46, 0xca, 0xd7, 0xeb, 0x4f, 0x3a, 0xbc, 0x69, 0xac, 0x9b, 0xce, 0x77,
      0x35, 0x8e, 0xa8, 0x31, 0xd7, 0x2f, 0x14, 0xdd,
    ]),
    clearData: utils.fromString('this is very secret'),
    encryptedData: new Uint8Array([
      0x01, 0xc9, 0x5d, 0xe6, 0xa, 0x34, 0xb2, 0x89, 0x42, 0x7a, 0x6d, 0xda,
      0xd7, 0x7b, 0xa4, 0x58, 0xa7, 0xbf, 0xc8, 0x4f, 0xf5, 0x52, 0x9e, 0x12,
      0x4, 0x9d, 0xfc, 0xaa, 0x83, 0xb0, 0x71, 0x59, 0x91, 0xfb, 0xaa, 0xe2,
      0x6d, 0x4b, 0x1, 0x7, 0xdc, 0xce, 0xd9, 0xcc, 0xc4, 0xad, 0xdf, 0x89,
      0x7b, 0x86, 0xe, 0x14, 0x22, 0x56, 0x3c, 0x43, 0x16, 0x97, 0x9a, 0x68,
    ]),
    resourceId: new Uint8Array([
      0xc4, 0xad, 0xdf, 0x89, 0x7b, 0x86, 0xe, 0x14, 0x22, 0x56, 0x3c, 0x43,
      0x16, 0x97, 0x9a, 0x68,
    ]),
  }];

  const testVectorsV2 = [{
    key: new Uint8Array([
      0x76, 0xd, 0x8e, 0x80, 0x5c, 0xbc, 0xa8, 0xb6, 0xda, 0xea, 0xcf, 0x66,
      0x46, 0xca, 0xd7, 0xeb, 0x4f, 0x3a, 0xbc, 0x69, 0xac, 0x9b, 0xce, 0x77,
      0x35, 0x8e, 0xa8, 0x31, 0xd7, 0x2f, 0x14, 0xdd,
    ]),
    clearData: utils.fromString('this is very secret'),
    encryptedData: new Uint8Array([
      0x02, 0x32, 0x93, 0xa3, 0xf8, 0x6c, 0xa8, 0x82, 0x25, 0xbc, 0x17, 0x7e,
      0xb5, 0x65, 0x9b, 0xee, 0xd, 0xfd, 0xcf, 0xc6, 0x5c, 0x6d, 0xb4, 0x72,
      0xe0, 0x5b, 0x33, 0x27, 0x4c, 0x83, 0x84, 0xd1, 0xad, 0xda, 0x5f, 0x86,
      0x2, 0x46, 0x42, 0x91, 0x71, 0x30, 0x65, 0x2e, 0x72, 0x47, 0xe6, 0x48,
      0x20, 0xa1, 0x86, 0x91, 0x7f, 0x9c, 0xb5, 0x5e, 0x91, 0xb3, 0x65, 0x2d,
    ]),
    resourceId: new Uint8Array([
      0x72, 0x47, 0xe6, 0x48, 0x20, 0xa1, 0x86, 0x91, 0x7f, 0x9c, 0xb5, 0x5e,
      0x91, 0xb3, 0x65, 0x2d,
    ]),
  }];

  const testVectorsV3 = [{
    key: new Uint8Array([
      0x76, 0xd, 0x8e, 0x80, 0x5c, 0xbc, 0xa8, 0xb6, 0xda, 0xea, 0xcf, 0x66,
      0x46, 0xca, 0xd7, 0xeb, 0x4f, 0x3a, 0xbc, 0x69, 0xac, 0x9b, 0xce, 0x77,
      0x35, 0x8e, 0xa8, 0x31, 0xd7, 0x2f, 0x14, 0xdd,
    ]),
    clearData: utils.fromString('this is very secret'),
    encryptedData: new Uint8Array([
      0x03, 0x37, 0xb5, 0x3d, 0x55, 0x34, 0xb5, 0xc1, 0x3f, 0xe3, 0x72, 0x81,
      0x47, 0xf0, 0xca, 0xda, 0x29, 0x99, 0x6e, 0x4, 0xa8, 0x41, 0x81, 0xa0,
      0xe0, 0x5e, 0x8e, 0x3a, 0x8, 0xd3, 0x78, 0xfa, 0x5, 0x9f, 0x17, 0xfa,
    ]),
    resourceId: new Uint8Array([
      0xa8, 0x41, 0x81, 0xa0, 0xe0, 0x5e, 0x8e, 0x3a, 0x8, 0xd3, 0x78, 0xfa,
      0x5, 0x9f, 0x17, 0xfa,
    ]),
  }];

  const testVectorsV5 = [{
    key: new Uint8Array([
      0x76, 0xd, 0x8e, 0x80, 0x5c, 0xbc, 0xa8, 0xb6, 0xda, 0xea, 0xcf, 0x66,
      0x46, 0xca, 0xd7, 0xeb, 0x4f, 0x3a, 0xbc, 0x69, 0xac, 0x9b, 0xce, 0x77,
      0x35, 0x8e, 0xa8, 0x31, 0xd7, 0x2f, 0x14, 0xdd,
    ]),
    clearData: utils.fromString('this is very secret'),
    encryptedData: new Uint8Array([
      0x05, 0xc1, 0x74, 0x53, 0x1e, 0xdd, 0x77, 0x77, 0x87, 0x2c, 0x02,
      0x6e, 0xf2, 0x36, 0xdf, 0x28, 0x7e, 0x70, 0xea, 0xb6, 0xe7, 0x72,
      0x7d, 0xdd, 0x42, 0x5d, 0xa1, 0xab, 0xb3, 0x6e, 0xd1, 0x8b, 0xea,
      0xd7, 0xf5, 0xad, 0x23, 0xc0, 0xbd, 0x8c, 0x1f, 0x68, 0xc7, 0x9e,
      0xf2, 0xe9, 0xd8, 0x9e, 0xf9, 0x7e, 0x93, 0xc4, 0x29, 0x0d, 0x96,
      0x40, 0x2d, 0xbc, 0xf8, 0x0b, 0xb8, 0x4f, 0xfc, 0x48, 0x9b, 0x83,
      0xd1, 0x05, 0x51, 0x40, 0xfc, 0xc2, 0x7f, 0x6e, 0xd9, 0x16,
    ]),
    resourceId: new Uint8Array([
      0xc1, 0x74, 0x53, 0x1e, 0xdd, 0x77, 0x77, 0x87, 0x2c, 0x02, 0x6e, 0xf2,
      0x36, 0xdf, 0x28, 0x7e,
    ]),
  }];

  const tamperWith = (data: Uint8Array, position?: number): Uint8Array => {
    if (position === undefined)
      position = Math.floor(Math.random() * data.length); // eslint-disable-line no-param-reassign
    else if (position < 0)
      position = data.length + position; // eslint-disable-line no-param-reassign
    const tamperedData = new Uint8Array(data);
    tamperedData[position] = (tamperedData[position]! + 1) % 256;
    return tamperedData;
  };

  before(() => cryptoReady);

  type CommonEncryptorOperations = {
    encrypt: (k: Uint8Array, d: Uint8Array) => Uint8Array,
    decrypt: (k: Uint8Array, d: Uint8Array) => Uint8Array,
  };

  const generateCommonTests = (encryptor: Encryptor, testVectors: Array<TestVector>, { encrypt, decrypt }: CommonEncryptorOperations) => {
    it('extractResourceId should throw on a truncated buffer', () => {
      const buf = new Uint8Array([1]);
      expect(() => encryptor.extractResourceId(buf)).to.throw();
    });

    it('should encrypt / decrypt a buffer', () => {
      const buffers = {
        empty: new Uint8Array(),
        oneChar: new Uint8Array([0x80]),
        small: utils.fromString('small'),
        medium: utils.fromString('this is the data to encrypt'),
      };

      for (const clearData of Object.values(buffers)) {
        const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
        const encryptedData = encrypt(key, clearData);
        const decryptedData = decrypt(key, encryptedData);
        expect(decryptedData).to.deep.equal(clearData);
      }
    });

    it('should decrypt a buffer', () => {
      for (const testVector of testVectors) {
        const decryptedData = decrypt(testVector.key, testVector.encryptedData);
        expect(decryptedData).to.deep.equal(testVector.clearData);

        const resourceId = encryptor.extractResourceId(testVector.encryptedData);
        expect(resourceId).to.deep.equal(testVector.resourceId);
      }
    });

    it('should throw if trying to decrypt a corrupted buffer', () => {
      for (const testVector of testVectors) {
        for (const position of [7, -20, -1]) {
          expect(() => decrypt(testVector.key, tamperWith(testVector.encryptedData, position))).to.throw();
        }
      }
    });

    it('should compute clear and encrypted sizes', () => {
      const { overhead, getClearSize, getEncryptedSize } = encryptor;
      const clearSize = getClearSize(testVectors[0]!.encryptedData.length);
      const encryptedSize = getEncryptedSize(testVectors[0]!.clearData.length);
      expect(clearSize).to.equal(testVectors[0]!.clearData.length);
      expect(encryptedSize).to.equal(testVectors[0]!.encryptedData.length);
      expect(encryptedSize - clearSize).to.equal(overhead);
    });
  };

  type SimpleEncryptorOperations = {
    encrypt: (k: Uint8Array, d: Uint8Array) => any,
  };

  const generateSimpleTests = (encryptor: Encryptor, testVectors: Array<TestVector>, { encrypt }: SimpleEncryptorOperations) => {
    it('should unserialize/serialize a test vector', () => {
      for (const testVector of testVectors) {
        // @ts-expect-error TS fears that we call encryptorVX.serialize(encryptorVY.unserialize()), it doesn't know that they're the same
        const reserializedData = encryptor.serialize(encryptor.unserialize(testVector.encryptedData));
        expect(reserializedData).to.deep.equal(testVector.encryptedData);
      }
    });

    it('should output the right resourceId', () => {
      const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
      const encryptedData = encrypt(key, utils.fromString('test'));
      const buff = encryptor.serialize(encryptedData);
      expect(encryptor.extractResourceId(buff)).to.deep.equal(encryptedData.resourceId);
    });
  };

  describe('EncryptionFormatV1', () => {
    generateCommonTests(encryptorV1, testVectorsV1, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV1.serialize(encryptorV1.encrypt(k, d)),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV1.decrypt(k, encryptorV1.unserialize(d)),
    });
    generateSimpleTests(encryptorV1, testVectorsV1, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV1.encrypt(k, d),
    });
  });
  describe('EncryptionFormatV2', () => {
    generateCommonTests(encryptorV2, testVectorsV2, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV2.serialize(encryptorV2.encrypt(k, d)),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV2.decrypt(k, encryptorV2.unserialize(d)),
    });
    generateSimpleTests(encryptorV2, testVectorsV2, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV2.encrypt(k, d),
    });
  });
  describe('EncryptionFormatV3', () => {
    generateCommonTests(encryptorV3, testVectorsV3, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV3.serialize(encryptorV3.encrypt(k, d)),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV3.decrypt(k, encryptorV3.unserialize(d)),
    });
    generateSimpleTests(encryptorV3, testVectorsV3, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV3.encrypt(k, d),
    });
  });
  describe('EncryptionFormatV5', () => {
    generateCommonTests(encryptorV5, testVectorsV5, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV5.serialize(encryptorV5.encrypt(k, d, random(tcrypto.MAC_SIZE))),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV5.decrypt(k, encryptorV5.unserialize(d)),
    });
    generateSimpleTests(encryptorV5, testVectorsV5, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV5.encrypt(k, d, random(tcrypto.MAC_SIZE)),
    });
  });
});
