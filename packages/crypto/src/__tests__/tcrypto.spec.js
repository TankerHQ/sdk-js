// @flow
import { tcrypto } from '@tanker/crypto';

import { expect } from './chai';
import { decryptAEADv1, decryptAEADv2, encryptAEADv1, encryptAEADv2 } from '../aead';
import { fromString } from '../utils';

describe('tcrypto', () => {
  it('should encrypt and decrypt', async () => {
    const key = fromString('12345678123456781234567812345678');
    const text = fromString('plop');
    const cipher = await encryptAEADv1(key, text);
    const text2 = await decryptAEADv1(key, cipher);

    expect(text2).to.deep.equal(text);
  });

  it('should encrypt and decrypt with associated data', async () => {
    const key = fromString('12345678123456781234567812345678');
    const text = fromString('plop');
    const aad = fromString('associated authenticated data');
    const cipher = await encryptAEADv1(key, text, aad);
    const text2 = await decryptAEADv1(key, cipher, aad);

    expect(text2).to.deep.equal(text);
  });

  it('should encrypt and decrypt with associated data v2', async () => {
    const key = fromString('12345678123456781234567812345678');
    const text = fromString('plop');
    const aad = fromString('associated authenticated data');
    const cipher = await encryptAEADv2(key, text, aad);
    const text2 = await decryptAEADv2(key, cipher, aad);

    expect(text2).to.deep.equal(text);
  });

  it('should fail to decrypt corrupt ciphertext', async () => {
    const key = fromString('12345678123456781234567812345678');
    const text = fromString('plop');
    const cipher = await encryptAEADv1(key, text);
    cipher[0] += 1;

    const promise = decryptAEADv1(key, cipher);
    await expect(promise).to.be.rejected;
  });

  it('should be able to encrypt/decrypt with seal method', async () => {
    const keyPair = tcrypto.makeEncryptionKeyPair();
    const text = fromString('plop');

    const cipher = tcrypto.sealEncrypt(text, keyPair.publicKey);
    const decryptedText = tcrypto.sealDecrypt(cipher, keyPair);

    await expect(decryptedText).to.deep.equal(text);
  });

  it('should be able to derive an IV from a seed and an index', async () => {
    const seed = fromString('12345678123456781234567812345678');
    const index = 1024;
    const expectedIV = new Uint8Array([
      0x65, 0xb4, 0x3a, 0xd1, 0xf, 0xdf, 0xb2, 0x37,
      0x2e, 0xd7, 0xef, 0xe2, 0x54, 0xba, 0x59, 0x80,
      0xc5, 0x92, 0x10, 0x79, 0xd, 0xe0, 0x1a, 0xf1,
    ]);
    const iv = tcrypto.deriveIV(seed, index);
    expect(iv).to.deep.equal(expectedIV);
  });
});
