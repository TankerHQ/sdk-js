// @flow

import varint from 'varint';
import { utils } from '@tanker/crypto';

import { expect } from './chai';

import { InvalidEncryptionFormat } from '../errors';
import { decryptData, encryptData } from '../DataProtection/Encryptor';
import * as EncryptorV1 from '../DataProtection/Encryptors/v1';
import * as EncryptorV2 from '../DataProtection/Encryptors/v2';
import * as EncryptorV3 from '../DataProtection/Encryptors/v3';

describe('Encryptor', () => {
  const clearData = utils.fromString('this is very secret');

  const key = new Uint8Array([
    0x76, 0xd, 0x8e, 0x80, 0x5c, 0xbc, 0xa8, 0xb6, 0xda, 0xea, 0xcf, 0x66,
    0x46, 0xca, 0xd7, 0xeb, 0x4f, 0x3a, 0xbc, 0x69, 0xac, 0x9b, 0xce, 0x77,
    0x35, 0x8e, 0xa8, 0x31, 0xd7, 0x2f, 0x14, 0xdd,
  ]);

  const configs = [
    {
      version: 1,
      encryptor: EncryptorV1,
      testVector: new Uint8Array([
        // encrypted data
        0xc9, 0x5d, 0xe6, 0xa, 0x34, 0xb2, 0x89, 0x42, 0x7a, 0x6d, 0xda, 0xd7,
        0x7b, 0xa4, 0x58, 0xa7, 0xbf, 0xc8, 0x4f,
        // mac
        0xf5, 0x52, 0x9e, 0x12, 0x4, 0x9d, 0xfc, 0xaa, 0x83, 0xb0, 0x71, 0x59,
        0x91, 0xfb, 0xaa, 0xe2,
        // iv
        0x6d, 0x4b, 0x1, 0x7, 0xdc, 0xce, 0xd9, 0xcc, 0xc4, 0xad, 0xdf, 0x89,
        0x7b, 0x86, 0xe, 0x14, 0x22, 0x56, 0x3c, 0x43, 0x16, 0x97, 0x9a, 0x68,
      ]),
    },
    {
      version: 2,
      encryptor: EncryptorV2,
      testVector: new Uint8Array([
        // iv
        0x32, 0x93, 0xa3, 0xf8, 0x6c, 0xa8, 0x82, 0x25, 0xbc, 0x17, 0x7e, 0xb5,
        0x65, 0x9b, 0xee, 0xd, 0xfd, 0xcf, 0xc6, 0x5c, 0x6d, 0xb4, 0x72, 0xe0,
        // encrypted data
        0x5b, 0x33, 0x27, 0x4c, 0x83, 0x84, 0xd1, 0xad, 0xda, 0x5f, 0x86, 0x2,
        0x46, 0x42, 0x91, 0x71, 0x30, 0x65, 0x2e,
        // mac
        0x72, 0x47, 0xe6, 0x48, 0x20, 0xa1, 0x86, 0x91, 0x7f, 0x9c, 0xb5, 0x5e,
        0x91, 0xb3, 0x65, 0x2d,
      ]),
    },
    {
      version: 3,
      encryptor: EncryptorV3,
      testVector: new Uint8Array([
        // encrypted data
        0x37, 0xb5, 0x3d, 0x55, 0x34, 0xb5, 0xc1, 0x3f, 0xe3, 0x72, 0x81, 0x47,
        0xf0, 0xca, 0xda, 0x29, 0x99, 0x6e, 0x4,
        // mac
        0xa8, 0x41, 0x81, 0xa0, 0xe0, 0x5e, 0x8e, 0x3a, 0x8, 0xd3, 0x78, 0xfa,
        0x5, 0x9f, 0x17, 0xfa,
      ]),
    }
  ];

  const tamperWith = (data: Uint8Array): Uint8Array => {
    const bytePosition = Math.floor(Math.random() * data.length);
    const tamperedData = new Uint8Array(data);
    tamperedData[bytePosition] = (tamperedData[bytePosition] + 1) % 256;
    return tamperedData;
  };

  it('should throw when an unsupported format version is detected', () => {
    const zeroVersion = varint.encode(0);
    const incorrectVersion = varint.encode(52);
    expect(() => decryptData(key, zeroVersion)).to.throw(InvalidEncryptionFormat);
    expect(() => decryptData(key, incorrectVersion)).to.throw(InvalidEncryptionFormat);
  });

  it('should encrypt / decrypt a buffer', () => {
    const encryptedData = encryptData(key, clearData);
    const decryptedData = decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });

  configs.forEach(({ version, testVector }) => {
    it(`should decrypt a buffer v${version}`, () => {
      const resource = utils.concatArrays(new Uint8Array([version]), testVector);
      const decryptedData = decryptData(key, resource);
      expect(decryptedData).to.deep.equal(clearData);
    });

    it(`should throw if trying to decrypt a corrupted buffer v${version}`, () => {
      const resource = utils.concatArrays(new Uint8Array([version]), tamperWith(testVector));
      expect(() => decryptData(key, resource)).to.throw();
    });
  });

  configs.forEach(({ version, testVector, encryptor }) => {
    describe(`EncryptorV${version}`, () => {
      it('should encrypt / decrypt a buffer', () => {
        const encryptedData = encryptor.encrypt(key, clearData);
        const decryptedData = encryptor.decrypt(key, encryptedData);
        expect(decryptedData).to.deep.equal(clearData);
      });

      it(`should decrypt a buffer v${version}`, () => {
        const decryptedData = encryptor.decrypt(key, testVector);
        expect(decryptedData).to.deep.equal(clearData);
      });

      it(`should throw if trying to decrypt a corrupted buffer v${version}`, () => {
        expect(() => encryptor.decrypt(key, tamperWith(testVector))).to.throw();
      });
    });
  });
});
