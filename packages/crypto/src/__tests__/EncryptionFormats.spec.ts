import { expect } from '@tanker/test-utils';
import { MergerStream, SlicerStream } from '@tanker/stream-base';
import type { Transform } from '@tanker/stream-base';

import { random } from '../random';
import { paddedFromClearSize, minimalPadding, Padding } from '../padding';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import * as encryptorV1 from '../EncryptionFormats/v1';
import * as encryptorV2 from '../EncryptionFormats/v2';
import * as encryptorV3 from '../EncryptionFormats/v3';
import * as encryptorV4 from '../EncryptionFormats/v4';
import * as encryptorV5 from '../EncryptionFormats/v5';
import * as encryptorV6 from '../EncryptionFormats/v6';
import type { Encryptor } from '../EncryptionFormats/types';
import { EncryptionStream } from '../EncryptionFormats/EncryptionStream';
import { DecryptionStream } from '../EncryptionFormats/DecryptionStream';
import { ready as cryptoReady } from '../ready';

type TestVector = {
  key: Uint8Array,
  clearData: Uint8Array,
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
};

const processWithStream = (streamFactory: () => Transform, encryptedData: Uint8Array): Promise<Uint8Array> => {
  const slicer = new SlicerStream({ source: encryptedData });
  const processor = streamFactory();
  const merger = new MergerStream({ type: Uint8Array });

  return new Promise((resolve, reject) => {
    [slicer, processor, merger].forEach(s => s.on('error', reject));
    slicer.pipe(processor).pipe(merger).on('data', resolve);
  });
};

const truncate = (data: Uint8Array): Uint8Array => {
  const end = Math.floor(Math.random() * (data.length - 1));
  return data.subarray(0, end);
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

  const testVectorsV4 = [{
    key: new Uint8Array([
      0xda, 0xa5, 0x3d, 0x7, 0xc, 0x4b, 0x63, 0x54, 0xe3, 0x6f, 0x96,
      0xc1, 0x14, 0x4c, 0x23, 0xcc, 0x16, 0x23, 0x52, 0xa1, 0xc5, 0x53,
      0xe3, 0xea, 0xd9, 0xc4, 0x1d, 0x28, 0x4c, 0x45, 0x43, 0xa9,
    ]),
    clearData: new Uint8Array([]),
    encryptedData: new Uint8Array([
      0x4, 0x0, 0x0, 0x10, 0x0, 0x5e, 0x44, 0x54, 0xa7, 0x83, 0x21,
      0xd8, 0x77, 0x8c, 0x7a, 0x25, 0xc9, 0x46, 0x52, 0xa, 0x60, 0x1d,
      0xb1, 0x25, 0xaf, 0x1e, 0x85, 0x84, 0xa9, 0xcf, 0x19, 0x71, 0x26,
      0x79, 0xf3, 0x47, 0xd1, 0xf6, 0xf0, 0xf7, 0x2, 0x85, 0x47, 0xfb,
      0xe8, 0x5e, 0x16, 0x25, 0x33, 0xf6, 0x66, 0x7b, 0xb9, 0xd5, 0xa5,
      0x1d, 0xe9, 0x23, 0x71, 0xb, 0x75,
    ]),
    resourceId: new Uint8Array([
      0x5e, 0x44, 0x54, 0xa7, 0x83, 0x21, 0xd8, 0x77, 0x8c, 0x7a, 0x25, 0xc9,
      0x46, 0x52, 0xa, 0x60,
    ]),
  }, {
    key: new Uint8Array([
      0xaf, 0x38, 0x67, 0x9d, 0x20, 0x56, 0x38, 0x6b, 0xef, 0xdd, 0x62,
      0x6d, 0x60, 0x1b, 0xf9, 0x39, 0xad, 0x71, 0x43, 0xc0, 0x30, 0x14,
      0xed, 0xea, 0x56, 0xff, 0x1f, 0x8a, 0x30, 0x90, 0xb6, 0x8b,
    ]),
    clearData: utils.fromString('this is a secret'),
    encryptedData: new Uint8Array([
      0x4, 0x0, 0x0, 0x10, 0x0, 0xf2, 0x38, 0x50, 0x31, 0x6c, 0xfa,
      0xaa, 0x96, 0x8c, 0x1b, 0x25, 0x43, 0xf4, 0x38, 0xe3, 0x61, 0x55,
      0x24, 0x50, 0xe8, 0x3b, 0x3, 0xe9, 0xf6, 0x1, 0xf1, 0x73, 0x5f,
      0x3e, 0x52, 0xb2, 0x8f, 0xc0, 0x1f, 0xd, 0xcd, 0xac, 0x8f, 0x5,
      0x2a, 0xbd, 0x31, 0x32, 0xe, 0x16, 0xdd, 0x20, 0x40, 0x58, 0xa2,
      0xfe, 0xc6, 0xf3, 0x5d, 0xff, 0x25, 0xe8, 0xc9, 0x33, 0xc1, 0x8,
      0xe0, 0xb1, 0xb0, 0xb, 0xe4, 0x86, 0x8c, 0x36, 0xb8, 0x2f, 0xbf,
    ]),
    resourceId: new Uint8Array([
      0xf2, 0x38, 0x50, 0x31, 0x6c, 0xfa, 0xaa, 0x96, 0x8c, 0x1b, 0x25, 0x43,
      0xf4, 0x38, 0xe3, 0x61,
    ]),
  }, {
    key: new Uint8Array([
      0xa, 0x7, 0x3d, 0xd0, 0x2c, 0x2d, 0x17, 0xf9, 0x49, 0xd9, 0x35,
      0x8e, 0xf7, 0xfe, 0x7b, 0xd1, 0xf6, 0xb, 0xf1, 0x5c, 0xa4, 0x32,
      0x1e, 0xe4, 0xaa, 0x18, 0xe1, 0x97, 0xbf, 0xf4, 0x5e, 0xfe,
    ]),
    clearData: utils.fromString('this is a secret'),
    encryptedData: new Uint8Array([
      0x4, 0x46, 0x0, 0x0, 0x0, 0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b,
      0x27, 0x32, 0xc9, 0xa, 0x1e, 0xc6, 0x8f, 0x2b, 0xdb, 0xcd, 0x7, 0xd0,
      0x3a, 0xc8, 0x74, 0xe1, 0x8, 0x7e, 0x5e, 0xaa, 0xa2, 0x82, 0xd8, 0x8b,
      0xf5, 0xed, 0x22, 0xe6, 0x30, 0xbb, 0xaa, 0x9d, 0x71, 0xe3, 0x9a, 0x4,
      0x22, 0x67, 0x3d, 0xdf, 0xcf, 0x28, 0x48, 0xe2, 0xeb, 0x4b, 0xb4, 0x30,
      0x92, 0x70, 0x23, 0x49, 0x1c, 0xc9, 0x31, 0xcb, 0xda, 0x1a, 0x4, 0x46,
      0x0, 0x0, 0x0, 0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b, 0x27, 0x32,
      0xc9, 0xa, 0x1e, 0xc6, 0x8f, 0x2b, 0xdb, 0x3f, 0x34, 0xf3, 0xd3, 0x23,
      0x90, 0xfc, 0x6, 0x35, 0xda, 0x99, 0x1e, 0x81, 0xdf, 0x88, 0xfc, 0x21,
      0x1e, 0xed, 0x3a, 0x28, 0x2d, 0x51, 0x82, 0x77, 0x7c, 0xf6, 0xbe, 0x54,
      0xd4, 0x92, 0xcd, 0x86, 0xd4, 0x88, 0x55, 0x20, 0x1f, 0xd6, 0x44, 0x47,
      0x30, 0x40, 0x2f, 0xe8, 0xf4, 0x50,
    ]),
    resourceId: new Uint8Array([
      0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b, 0x27, 0x32, 0xc9, 0xa, 0x1e,
      0xc6, 0x8f, 0x2b, 0xdb,
    ]),
  },
  ];

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

  const testVectorsV6 = [{
    key: new Uint8Array([
      0x56, 0x95, 0xa2, 0x36, 0x2b, 0x8b, 0x11, 0x92, 0xf9, 0x56, 0x0b, 0xcb,
      0xf2, 0x07, 0x6a, 0x21, 0x03, 0x2c, 0x82, 0x3b, 0xbe, 0x21, 0x60, 0x2f,
      0x64, 0xf9, 0xc2, 0x9f, 0xe5, 0xe5, 0x6d, 0x7f,
    ]),
    clearData: utils.fromString('this is very secret'),
    encryptedData: new Uint8Array([
      0x06, 0x46, 0xfd, 0x4a, 0xab, 0x34, 0x24, 0x3b, 0x97, 0x0e, 0x13, 0x90,
      0x32, 0x88, 0x5c, 0xba, 0xc7, 0x82, 0x4d, 0xeb, 0xb0, 0x5b, 0xd2, 0x26,
      0x6e, 0xc6, 0x7c, 0x05, 0xf0, 0xfc, 0x77, 0x95, 0x34, 0xa2, 0xfa, 0x7e,
      0x6e, 0x36,
    ]),
    resourceId: new Uint8Array([
      0xd2, 0x26, 0x6e, 0xc6, 0x7c, 0x05, 0xf0, 0xfc, 0x77, 0x95, 0x34, 0xa2,
      0xfa, 0x7e, 0x6e, 0x36,
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
    encrypt: (k: Uint8Array, d: Uint8Array) => Uint8Array | Promise<Uint8Array>,
    decrypt: (k: Uint8Array, d: Uint8Array) => Uint8Array | Promise<Uint8Array>,
  };

  const generateCommonTests = (encryptor: Encryptor, testVectors: Array<TestVector>, { encrypt, decrypt }: CommonEncryptorOperations) => {
    it('extractResourceId should throw on a truncated buffer', () => {
      const buf = new Uint8Array([1]);
      expect(() => encryptor.extractResourceId(buf)).to.throw();
    });

    it('should encrypt / decrypt a buffer', async () => {
      const buffers = {
        empty: new Uint8Array(),
        oneChar: new Uint8Array([0x80]),
        small: utils.fromString('small'),
        medium: utils.fromString('this is the data to encrypt'),
      };

      for (const clearData of Object.values(buffers)) {
        const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
        const encryptedData = await encrypt(key, clearData);
        const decryptedData = await decrypt(key, encryptedData);
        expect(decryptedData).to.deep.equal(clearData);
      }
    });

    it('should decrypt a buffer', async () => {
      for (const testVector of testVectors) {
        const decryptedData = await decrypt(testVector.key, testVector.encryptedData);
        expect(decryptedData).to.deep.equal(testVector.clearData);

        const resourceId = encryptor.extractResourceId(testVector.encryptedData);
        expect(resourceId).to.deep.equal(testVector.resourceId);
      }
    });

    it('should throw if trying to decrypt a corrupted buffer', () => {
      for (const testVector of testVectors) {
        for (const position of [7, -20, -1]) {
          expect((async () => decrypt(testVector.key, tamperWith(testVector.encryptedData, position)))()).to.be.rejected;
        }
      }
    });
  };

  const generateUnpaddedTests = (encryptor: Encryptor, testVectors: Array<TestVector>) => {
    it('should compute clear and encrypted sizes', () => {
      const { overhead, getClearSize, getEncryptedSize } = encryptor;
      const clearSize = getClearSize(testVectors[0]!.encryptedData.length);
      const encryptedSize = getEncryptedSize(testVectors[0]!.clearData.length);
      expect(clearSize).to.equal(testVectors[0]!.clearData.length);
      expect(encryptedSize).to.equal(testVectors[0]!.encryptedData.length);
      expect(encryptedSize - clearSize).to.equal(overhead);
    });
  };

  type PaddedEncryptorOperations = {
    encrypt: (k: Uint8Array, d: Uint8Array, padding: number | Padding) => Uint8Array | Promise<Uint8Array>,
    decrypt: (k: Uint8Array, d: Uint8Array) => Uint8Array | Promise<Uint8Array>,
  };

  const generatePaddedTests = (encryptor: Encryptor, testVectors: Array<TestVector>, { encrypt, decrypt }: PaddedEncryptorOperations) => {
    for (const padding of [1, 2, 5, 13])
      describe(`common tests with a padding of ${padding}`, () => {
        generateCommonTests(encryptor, testVectors, {
          encrypt: (k: Uint8Array, d: Uint8Array) => encrypt(k, d, padding),
          decrypt,
        });
      });

    it('computes clear and encrypted sizes', () => {
      const { overhead, getClearSize, getEncryptedSize } = encryptor;
      const clearSize = getClearSize(testVectors[0]!.encryptedData.length);
      const encryptedSize = getEncryptedSize(testVectors[0]!.clearData.length);
      // add one to include the padding byte
      expect(clearSize + 1).to.equal(paddedFromClearSize(testVectors[0]!.clearData.length));
      expect(encryptedSize).to.equal(testVectors[0]!.encryptedData.length);
      // encryptorv6.overhead does not include the padding byte
      expect(encryptedSize - clearSize).to.equal(overhead);
    });

    it('encryptedSize should have a minimal value', async () => {
      for (const clearSize of [0, 1, 8, 9]) {
        // @ts-expect-error I don't know what you're saying, this function takes a Padding
        expect(encryptor.getEncryptedSize(clearSize, Padding.AUTO)).to.equal(minimalPadding + encryptor.overhead);

        const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
        expect((await encrypt(key, new Uint8Array(clearSize), Padding.AUTO)).length).to.equal(minimalPadding + encryptor.overhead);
      }
    });

    it('encryptedSize should use the padme algorithm in auto padding', async () => {
      const paddedWithAuto: Array<[number, number]> = [
        [10, 10],
        [11, 12],
        [42, 44],
        [250, 256],
      ];
      for (const [clearSize, paddedSize] of paddedWithAuto) {
        // @ts-expect-error we know encryptor is not encryption v4
        expect(encryptor.getEncryptedSize(clearSize, Padding.AUTO)).to.equal(paddedSize + encryptor.overhead);

        const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
        expect((await encrypt(key, new Uint8Array(clearSize), Padding.AUTO)).length).to.equal(paddedSize + encryptor.overhead);
      }
    });

    it('encryptedSize should use the paddingStep parameter correctly', async () => {
      const paddedToStepFive: Array<[number, number]> = [
        [0, 5],
        [2, 5],
        [4, 5],
        [5, 5],
        [9, 10],
        [10, 10],
        [14, 15],
        [40, 40],
        [42, 45],
        [45, 45],
      ];
      for (const [clearSize, paddedSize] of paddedToStepFive) {
        expect(encryptor.getEncryptedSize(clearSize, 5)).to.equal(paddedSize + encryptor.overhead);

        const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
        expect((await encrypt(key, new Uint8Array(clearSize), 5)).length).to.equal(paddedSize + encryptor.overhead);
      }
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
    generateUnpaddedTests(encryptorV1, testVectorsV1);
    generateSimpleTests(encryptorV1, testVectorsV1, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV1.encrypt(k, d),
    });
  });
  describe('EncryptionFormatV2', () => {
    generateCommonTests(encryptorV2, testVectorsV2, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV2.serialize(encryptorV2.encrypt(k, d)),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV2.decrypt(k, encryptorV2.unserialize(d)),
    });
    generateUnpaddedTests(encryptorV2, testVectorsV2);
    generateSimpleTests(encryptorV2, testVectorsV2, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV2.encrypt(k, d),
    });
  });
  describe('EncryptionFormatV3', () => {
    generateCommonTests(encryptorV3, testVectorsV3, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV3.serialize(encryptorV3.encrypt(k, d)),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV3.decrypt(k, encryptorV3.unserialize(d)),
    });
    generateUnpaddedTests(encryptorV3, testVectorsV3);
    generateSimpleTests(encryptorV3, testVectorsV3, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV3.encrypt(k, d),
    });
  });
  describe('EncryptionFormatV4', () => {
    generateCommonTests(encryptorV4, testVectorsV4, {
      encrypt: (k: Uint8Array, d: Uint8Array) => processWithStream(() => new EncryptionStream(random(tcrypto.MAC_SIZE), k), d),
      decrypt: (k: Uint8Array, d: Uint8Array) => processWithStream(() => new DecryptionStream({ findKey: async () => k }), d),
    });
    generateUnpaddedTests(encryptorV4, testVectorsV4);

    const chunk1 = new Uint8Array([
      0x4, 0x46, 0x0, 0x0, 0x0, 0x40, 0xec, 0x8d, 0x84, 0xad, 0xbe, 0x2b, 0x27,
      0x32, 0xc9, 0xa, 0x1e, 0xc6, 0x8f, 0x2b, 0xdb, 0xcd, 0x7, 0xd0, 0x3a, 0xc8,
      0x74, 0xe1, 0x8, 0x7e, 0x5e, 0xaa, 0xa2, 0x82, 0xd8, 0x8b, 0xf5, 0xed, 0x22,
      0xe6, 0x30, 0xbb, 0xaa, 0x9d, 0x71, 0xe3, 0x9a, 0x4, 0x22, 0x67, 0x3d, 0xdf,
      0xcf, 0x28, 0x48, 0xe2, 0xeb, 0x4b, 0xb4, 0x30, 0x92, 0x70, 0x23, 0x49, 0x1c,
      0xc9, 0x31, 0xcb, 0xda, 0x1a,
    ]);
    const key = new Uint8Array([
      0xa, 0x7, 0x3d, 0xd0, 0x2c, 0x2d, 0x17, 0xf9, 0x49, 0xd9, 0x35, 0x8e,
      0xf7, 0xfe, 0x7b, 0xd1, 0xf6, 0xb, 0xf1, 0x5c, 0xa4, 0x32, 0x1e, 0xe4,
      0xaa, 0x18, 0xe1, 0x97, 0xbf, 0xf4, 0x5e, 0xfe,
    ]);

    it('should unserialize/serialize a test vector', () => {
      const reserializedData = encryptorV4.serialize(encryptorV4.unserialize(chunk1));
      expect(reserializedData).to.deep.equal(chunk1);
    });

    it('should throw if trying to unserialize a truncated buffer v4', () => {
      expect(() => encryptorV4.decryptChunk(key, 0, encryptorV4.unserialize(truncate(chunk1)))).to.throw();
    });

    it('throws when the index is wrong', async () => {
      expect(() => {
        encryptorV4.decryptChunk(key, 1, encryptorV4.unserialize(chunk1));
      }).to.throw();
    });
  });
  describe('EncryptionFormatV5', () => {
    generateCommonTests(encryptorV5, testVectorsV5, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV5.serialize(encryptorV5.encrypt(k, d, random(tcrypto.MAC_SIZE))),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV5.decrypt(k, encryptorV5.unserialize(d)),
    });
    generateUnpaddedTests(encryptorV5, testVectorsV5);
    generateSimpleTests(encryptorV5, testVectorsV5, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV5.encrypt(k, d, random(tcrypto.MAC_SIZE)),
    });
  });
  describe('EncryptionFormatV6', () => {
    generateCommonTests(encryptorV6, testVectorsV6, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV6.serialize(encryptorV6.encrypt(k, d)),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV6.decrypt(k, encryptorV6.unserialize(d)),
    });
    generatePaddedTests(encryptorV6, testVectorsV6, {
      encrypt: (k: Uint8Array, d: Uint8Array, padding: number | Padding) => encryptorV6.serialize(encryptorV6.encrypt(k, d, padding)),
      decrypt: (k: Uint8Array, d: Uint8Array) => encryptorV6.decrypt(k, encryptorV6.unserialize(d)),
    });
    generateSimpleTests(encryptorV6, testVectorsV6, {
      encrypt: (k: Uint8Array, d: Uint8Array) => encryptorV6.encrypt(k, d),
    });
  });
});
