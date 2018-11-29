// @flow
import sinon from 'sinon';
import { expect } from './chai';

import { decryptAEADv1, decryptAEADv2, encryptAEADv1, encryptAEADv2, extractResourceId } from '../aead';
import { MAC_SIZE, SYMMETRIC_KEY_SIZE } from '../tcrypto';
import { fromString, toString } from '../utils';


const key = 'ThisIsABadKey';
const goodKey = new Uint8Array(SYMMETRIC_KEY_SIZE);

// IV at the end (...)
const resV1 = new Uint8Array([
  0x0c, 0xfb, 0xe5, 0xfd, 0xe7, 0x53, 0x56, 0x56, 0x5f, 0x5e, 0xe3,
  0x6a, 0x75, 0xe5, 0x9f, 0xd8, 0x1d, 0x63, 0x47, 0x9d, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

// IV at the begining
const resV2 = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x0c, 0xfb, 0xe5, 0xfd, 0xe7, 0x53, 0x56, 0x56, 0x5f,
  0x5e, 0xe3, 0x6a, 0x75, 0xe5, 0x9f, 0xd8, 0x1d, 0x63, 0x47, 0x9d
]);

// IV at the end (...)
const resV1WithAssociatedData = new Uint8Array([
  0x0c, 0xfb, 0xe5, 0xfd, 0x51, 0x76, 0xeb, 0x1e, 0xe8, 0x59, 0x82,
  0xa1, 0x37, 0x72, 0xad, 0x5e, 0x30, 0xeb, 0x6d, 0xfa, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

// IV at the begining
const resV2WithAssociatedData = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x0c, 0xfb, 0xe5, 0xfd, 0x51, 0x76, 0xeb, 0x1e, 0xe8,
  0x59, 0x82, 0xa1, 0x37, 0x72, 0xad, 0x5e, 0x30, 0xeb, 0x6d, 0xfa
]);

// On all platforms, make getRandomValues a no-op method, i.e. it
// will not populate the Uint8Array taken in argument.
const stubCrypto = () => {
  const hasWindow = typeof window !== 'undefined';
  if (!hasWindow) {
    global.window = { crypto: { getRandomValues: () => {} } };
    return () => { delete global.window; };
  }

  let randomStub;
  const hasMSCrypto = typeof window.msCrypto !== 'undefined';
  if (hasMSCrypto)
    randomStub = sinon.stub(window.msCrypto, 'getRandomValues').returns();
  else
    randomStub = sinon.stub(window.crypto, 'getRandomValues').returns();

  return () => { randomStub.restore(); };
};

function testAeadEncrypt(name, aeadFunc, testVector, testVectorWithAssociatedData) {
  return describe(name, () => {
    it('Should throw if no params are given', async () => {
      // $FlowExpectedError
      const promise = aeadFunc();
      await expect(promise).to.be.rejected;
    });

    it('Should throw if key is undefined', async () => {
      // $FlowExpectedError
      const promise = aeadFunc(undefined, fromString('test'));
      await expect(promise).to.be.rejected;
    });

    it('Should throw if message is empty', async () => {
      // $FlowExpectedError
      const promise = aeadFunc(key, fromString(''));
      await expect(promise).to.be.rejected;
    });

    it('Should throw if key type is wrong', async () => {
      // $FlowExpectedError
      const promise = aeadFunc(key, fromString('test'));
      await expect(promise).to.be.rejected;
    });

    it('Should throw if key has the wrong length', async () => {
      const promise = aeadFunc(fromString(key), fromString('test'));
      await expect(promise).to.be.rejected;
    });

    it('Should not give the same result twice', async () => {
      const res1 = await aeadFunc(goodKey, fromString('test'));
      const res2 = await aeadFunc(goodKey, fromString('test'));
      expect(res1).to.not.be.deep.equal(res2);
    });

    describe('given a non random IV', () => {
      let unstubCrypto;

      before(() => {
        unstubCrypto = stubCrypto();
      });

      after(() => {
        unstubCrypto();
      });

      it('Should always return the same thing if the random is the same', async () => {
        const res1 = await aeadFunc(goodKey, fromString('test'));
        const res2 = await aeadFunc(goodKey, fromString('test'));
        expect(res1).to.be.deep.equal(res2);
      });

      it('Should be ciphertext + iv', async () => {
        const res1 = await aeadFunc(goodKey, fromString('test'));
        expect(res1).to.be.deep.equal(testVector);
      });

      it('Should work with associated data', async () => {
        const gudAssociatedData = new Uint8Array(MAC_SIZE);
        const res1 = await aeadFunc(goodKey, fromString('test'), gudAssociatedData);
        expect(res1).to.be.deep.equal(testVectorWithAssociatedData);
      });
    });
  });
}

function testAeadDecrypt(name, aeadFunc, testVector, testVectorWithAssociatedData) {
  return describe(name, () => {
    it('should decrypt', async () => {
      const res = await aeadFunc(goodKey, testVector);
      expect(toString(res)).to.deep.equal('test');
    });

    it('Should throw if associated data is wrong', async () => {
      const wrongAssociatedData = new Uint8Array(MAC_SIZE);
      const promise = aeadFunc(goodKey, testVector, wrongAssociatedData);
      await expect(promise).to.be.rejected;
    });

    it('Should decrypt if associated data is gud', async () => {
      const gudAssociatedData = new Uint8Array(MAC_SIZE);
      const promise = aeadFunc(goodKey, testVectorWithAssociatedData, gudAssociatedData);
      await expect(promise).to.be.fulfilled;
    });
  });
}

describe('extractResourceId', () => {
  it('should throw if array too short', () => {
    const tooShort = new Uint8Array(2);
    expect(() => extractResourceId(tooShort)).to.throw();
  });

  it('should extract the last 16 digits of ciphertext', () => {
    const last16DigitsExtractedWithLove = new Uint8Array([
      0xe7, 0x53, 0x56, 0x56, 0x5f, 0x5e, 0xe3, 0x6a, 0x75, 0xe5, 0x9f, 0xd8,
      0x1d, 0x63, 0x47, 0x9d
    ]);

    expect(extractResourceId(resV2))
      .to.deep.equal(last16DigitsExtractedWithLove);
  });
});

describe('Crypto formats', () => {
  testAeadEncrypt('encryptAEADv1', encryptAEADv1, resV1, resV1WithAssociatedData);
  testAeadEncrypt('encryptAEADv2', encryptAEADv2, resV2, resV2WithAssociatedData);
  testAeadDecrypt('decryptAEADv1', decryptAEADv1, resV1, resV1WithAssociatedData);
  testAeadDecrypt('decryptAEADv2', decryptAEADv2, resV2, resV2WithAssociatedData);
});
