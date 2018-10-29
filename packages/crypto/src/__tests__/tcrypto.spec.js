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

  it('should be able to derive a key', async () => {
    const key = fromString('12345678123456781234567812345678');

    const subKeyOne = tcrypto.deriveKey(key, 1);
    const subKeyOneBis = tcrypto.deriveKey(key, 1);
    const subKeyTwo = tcrypto.deriveKey(key, 2);

    await expect(subKeyOne).to.deep.equal(subKeyOneBis);
    await expect(subKeyOne).not.to.deep.equal(subKeyTwo);
  });

  it('should encrypt and decrypt with derivated key', async () => {
    const key = fromString('12345678123456781234567812345678');
    const text = fromString('plop');

    const subKey = tcrypto.deriveKey(key, 1);

    const cipher = await encryptAEADv2(subKey, text);
    const decryptedText = await decryptAEADv2(subKey, cipher);

    await expect(decryptedText).to.deep.equal(text);
  });
});
