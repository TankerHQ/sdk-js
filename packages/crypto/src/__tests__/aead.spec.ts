import { expect } from '@tanker/test-utils';

import { decryptAEAD, encryptAEAD, extractMac } from '../aead';
import { ready } from '../ready';
import { MAC_SIZE, SYMMETRIC_KEY_SIZE, XCHACHA_IV_SIZE } from '../tcrypto';

describe('aead', () => {
  before(() => ready);

  const key = new Uint8Array(SYMMETRIC_KEY_SIZE); // filled with zeros

  const iv = new Uint8Array(XCHACHA_IV_SIZE); // filled with zeros

  const associatedData = new Uint8Array(MAC_SIZE); // filled with zeros

  const clearData = new Uint8Array([116, 101, 115, 116]); // bytes of "test" string

  const testVector = new Uint8Array([
    0x0c, 0xfb, 0xe5, 0xfd, 0xe7, 0x53, 0x56, 0x56, 0x5f, 0x5e, 0xe3, 0x6a,
    0x75, 0xe5, 0x9f, 0xd8, 0x1d, 0x63, 0x47, 0x9d,
  ]);

  // IV at the end (...)
  const testVectorWithAssociatedData = new Uint8Array([
    0x0c, 0xfb, 0xe5, 0xfd, 0x51, 0x76, 0xeb, 0x1e, 0xe8, 0x59, 0x82, 0xa1,
    0x37, 0x72, 0xad, 0x5e, 0x30, 0xeb, 0x6d, 0xfa,
  ]);

  describe('encryptAEAD', () => {
    it('should throw if no params are given', () => {
      // @ts-expect-error
      expect(() => encryptAEAD()).to.throw(TypeError);
    });

    it('should throw if key is undefined', () => {
      // @ts-expect-error
      expect(() => encryptAEAD(undefined, iv, clearData)).to.throw(TypeError);
    });

    it('should throw if key type is wrong', () => {
      const badKey = 'ThisIsABadKey';
      // @ts-expect-error
      expect(() => encryptAEAD(badKey, iv, clearData)).to.throw(TypeError);
    });

    it('should throw if key has the wrong length', () => {
      const badKey = new Uint8Array(SYMMETRIC_KEY_SIZE - 1);
      expect(() => encryptAEAD(badKey, iv, clearData)).to.throw(TypeError);
    });

    it('should throw if iv is undefined', () => {
      // @ts-expect-error
      expect(() => encryptAEAD(key, undefined, clearData)).to.throw(TypeError);
    });

    it('should throw if iv type is wrong', () => {
      const badIV = 'ThisIsABadIV';
      // @ts-expect-error
      expect(() => encryptAEAD(key, badIV, clearData)).to.throw(TypeError);
    });

    it('should throw if iv has the wrong length', () => {
      const badIV = new Uint8Array(XCHACHA_IV_SIZE - 1);
      expect(() => encryptAEAD(key, badIV, clearData)).to.throw(TypeError);
    });

    it('should throw if message is undefined', () => {
      // @ts-expect-error
      expect(() => encryptAEAD(key, iv, undefined)).to.throw(TypeError);
    });

    it('should not throw if message is empty', () => {
      const emptyData = new Uint8Array(0);
      expect(() => encryptAEAD(key, iv, emptyData)).not.to.throw();
    });

    it('should not give the same result if changing the iv', () => {
      const iv2 = new Uint8Array(iv);
      iv2[0] += 1;
      const res1 = encryptAEAD(key, iv, clearData);
      const res2 = encryptAEAD(key, iv2, clearData);
      expect(res1).to.not.be.deep.equal(res2);
    });

    describe('given a non random IV', () => {
      it('should always return the same thing if the random is the same', () => {
        const res1 = encryptAEAD(key, iv, clearData);
        const res2 = encryptAEAD(key, iv, clearData);
        expect(res1).to.be.deep.equal(res2);
      });

      it('should return the expected result', () => {
        const res1 = encryptAEAD(key, iv, clearData);
        expect(res1).to.be.deep.equal(testVector);
      });

      it('should work with associated data', () => {
        const res1 = encryptAEAD(key, iv, clearData, associatedData);
        expect(res1).to.be.deep.equal(testVectorWithAssociatedData);
      });
    });
  });

  describe('decryptAEAD', () => {
    const tamperWith = (data: Uint8Array): Uint8Array => {
      const bytePosition = Math.floor(Math.random() * data.length);
      const tamperedData = new Uint8Array(data);
      // @ts-expect-error bytePosition < data.length
      tamperedData[bytePosition] = (tamperedData[bytePosition] + 1) % 256;
      return tamperedData;
    };

    it('should decrypt without associated data', () => {
      expect(decryptAEAD(key, iv, testVector)).to.deep.equal(clearData);
    });

    it('should throw if key is wrong', () => {
      const badKey = tamperWith(key);
      expect(() => decryptAEAD(badKey, iv, testVector)).to.throw();
    });

    it('should throw if iv is wrong', () => {
      const badIV = tamperWith(iv);
      expect(() => decryptAEAD(key, badIV, testVector)).to.throw();
    });

    it('should throw if message is corrupted', () => {
      const badVector = tamperWith(testVector);
      expect(() => decryptAEAD(key, iv, badVector)).to.throw();
    });

    it('should decrypt with associated data', () => {
      expect(decryptAEAD(key, iv, testVectorWithAssociatedData, associatedData)).to.deep.equal(clearData);
    });

    it('should throw if associated data is wrong', () => {
      const badAssociatedData = tamperWith(associatedData);
      expect(() => decryptAEAD(key, iv, testVectorWithAssociatedData, badAssociatedData)).to.throw();
    });
  });

  describe('extractMac', () => {
    it('should throw if array too short', () => {
      const tooShort = new Uint8Array(2);
      expect(() => extractMac(tooShort)).to.throw();
    });

    it('should extract the last 16 digits of ciphertext', () => {
      const last16Digits = new Uint8Array([
        0xe7, 0x53, 0x56, 0x56, 0x5f, 0x5e, 0xe3, 0x6a, 0x75, 0xe5, 0x9f, 0xd8,
        0x1d, 0x63, 0x47, 0x9d,
      ]);

      expect(extractMac(testVector)).to.deep.equal(last16Digits);
    });
  });
});
