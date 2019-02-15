// @flow

import varint from 'varint';

import { random, tcrypto, utils } from '@tanker/crypto';

import { expect } from './chai';

import { InvalidEncryptionFormat } from '../errors';
import { decryptData, encryptData } from '../DataProtection/Encryptor';

describe('Encryptor', () => {
  const clearData = utils.fromString('this is very secret');

  it('should throw when an unsupported format version is detected', () => {
    const incorrectVersion = varint.encode(52);
    const zeroVersion = varint.encode(0);
    const key = utils.fromString('this is a key');

    expect(() => decryptData(key, zeroVersion)).to.throw(InvalidEncryptionFormat);
    expect(() => decryptData(key, incorrectVersion)).to.throw(InvalidEncryptionFormat);
  });

  it('should encrypt/decrypt a buffer with latest version', () => {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const encryptedData = encryptData(key, clearData);
    const decryptedData = decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });

  it('should decrypt a buffer v1', () => {
    const key = utils.fromBase64('dg2OgFy8qLba6s9mRsrX6086vGmsm853NY6oMdcvFN0=');
    const encryptedData = utils.fromBase64('Acld5go0solCem3a13ukWKe/yE/1Up4SBJ38qoOwcVmR+6ribUsBB9zO2czErd+Je4YOFCJWPEMWl5po');
    const decryptedData = decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });

  it('should decrypt a buffer v2', () => {
    const key = utils.fromBase64('XqV1NmaWWhDumAmjIg7SLckNO+UJczlclFFNGjgkZx0=');
    const encryptedData = utils.fromBase64('Ag40o25KiX7q4WjhCitEmYOBwGhZMTuPw+1j/Kuy+Nez89AWogT17gKzaViCZ13r7YhA9077CX1mwuxy');
    const decryptedData = decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });
});
