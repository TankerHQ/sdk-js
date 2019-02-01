// @flow

import varint from 'varint';

import { utils, aead } from '@tanker/crypto';

import { expect } from './chai';

import { InvalidEncryptionFormat } from '../errors';
import { decryptData } from '../DataProtection/decrypt';
import { encryptData } from '../DataProtection/encrypt';
import { concatArrays } from '../Blocks/Serialize';

describe('Encryptor', () => {
  beforeEach(async () => {
  });

  it('should throw when an unsupported format version is detected', async () => {
    const incorrectVersion = varint.encode(52);
    const zeroVersion = varint.encode(0);
    const key = utils.fromString('this is a key');
    const encryptedData = utils.fromString('encrypted message');

    await expect(decryptData(key, concatArrays(zeroVersion, encryptedData))).to.be.rejectedWith(InvalidEncryptionFormat);
    await expect(decryptData(key, concatArrays(incorrectVersion, encryptedData))).to.be.rejectedWith(InvalidEncryptionFormat);
  });

  it('should give the resourceId as resource id', async () => {
    const clearData = utils.fromString('this is very secret');

    const { resourceId, encryptedData } = await encryptData(clearData);

    const extractedMac = aead.extractMac(encryptedData);
    expect(resourceId).to.deep.equal(extractedMac);
  });

  it('should encrypt/decrypt a buffer', async () => {
    const clearData = utils.fromString('this is very secret');
    const { key, encryptedData } = await encryptData(clearData);
    const decryptedData = await decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });

  it('should decrypt a buffer v1', async () => {
    const clearData = utils.fromString('this is very secret');

    const key = utils.fromBase64('dg2OgFy8qLba6s9mRsrX6086vGmsm853NY6oMdcvFN0=');
    const encryptedData = utils.fromBase64('Acld5go0solCem3a13ukWKe/yE/1Up4SBJ38qoOwcVmR+6ribUsBB9zO2czErd+Je4YOFCJWPEMWl5po');

    const decryptedData = await decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });

  it('should decrypt a buffer v2', async () => {
    const clearData = utils.fromString('this is very secret');

    const key = utils.fromBase64('XqV1NmaWWhDumAmjIg7SLckNO+UJczlclFFNGjgkZx0=');
    const encryptedData = utils.fromBase64('Ag40o25KiX7q4WjhCitEmYOBwGhZMTuPw+1j/Kuy+Nez89AWogT17gKzaViCZ13r7YhA9077CX1mwuxy');

    const decryptedData = await decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });
});
