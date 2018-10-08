// @flow

import varint from 'varint';
import sodium from 'libsodium-wrappers';

import { tcrypto, utils } from '@tanker/crypto';

import { expect } from '@tanker/chai';

import { InvalidEncryptionFormat } from '../errors';
import { encryptData, decryptData } from '../Encryption/Encryptor';
import { concatArrays } from '../Blocks/Serialize';

describe('Encryptor', () => {
  beforeEach(async () => {
  });

  it('should throw when an unsupported format version is detected', async () => {
    const incorrectVersion = varint.encode(52);
    const zeroVersion = varint.encode(0);
    const key = utils.fromString('this is a key key key');
    const encryptedData = utils.fromString('encrypted encrypted xxxxxxxxxxxx');

    await expect(decryptData(key, concatArrays(zeroVersion, encryptedData))).to.be.rejectedWith(InvalidEncryptionFormat);
    await expect(decryptData(key, concatArrays(incorrectVersion, encryptedData))).to.be.rejectedWith(InvalidEncryptionFormat);
  });

  it('should give the resourceId as resource id', async () => {
    const clearData = utils.fromString('this is very secret, onii-chan');

    const { resourceId, encryptedData } = await encryptData(clearData);

    const extractedMac = encryptedData.subarray(-tcrypto.MAC_SIZE);
    expect(resourceId).to.deep.equal(extractedMac);
  });

  it('should give a correctly encrypted buffer', async () => {
    const clearData = utils.fromString('this is very secret, onii-chan');

    const { key, encryptedData } = await encryptData(clearData);

    const version = varint.decode(encryptedData);
    const iv = encryptedData.subarray(1, tcrypto.XCHACHA_IV_SIZE + 1);
    const rawCiphertext = encryptedData.subarray(1 + tcrypto.XCHACHA_IV_SIZE);
    const decryptedData = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, rawCiphertext, null, iv, key);

    expect(version).to.equal(2);
    expect(decryptedData).to.deep.equal(clearData);
  });

  it('should encrypt/decrypt a buffer', async () => {
    const clearData = utils.fromString('this is very secret, onii-chan');
    const { key, encryptedData } = await encryptData(clearData);
    const decryptedData = await decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });

  it('should decrypt a buffer v1', async () => {
    const clearData = utils.fromString('this is very secret, onii-chan');

    const key = utils.fromBase64('dg2OgFy8qLba6s9mRsrX6086vGmsm853NY6oMdcvFN0=');
    const encryptedData = utils.fromBase64('AWAazgnZIfXe7LU627+V8Fk7t7gBGrL3TAelh6AjNttq2ZcOZDrvFmUqO4i5McaryVoeSyMvTPrtjzxL5zbiTw9DzJ//iEk=');

    const decryptedData = await decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });

  it('should decrypt a buffer v2', async () => {
    const clearData = utils.fromString('this is very secret, onii-chan');

    const key = utils.fromBase64('6eR5h9NdIwTpEciaCVAfHI8Dht63jHC0c5zUut+niHY=');
    const encryptedData = utils.fromBase64('AlXQYmK+hFsY7cUqicFJHYtdyoR1JmDZKrInmcLIssdyFY0V10GZeoDUQOK/XHxBwmj+T1ywzsFeXTVU0/V1m2tBR9Dugng=');

    const decryptedData = await decryptData(key, encryptedData);
    expect(decryptedData).to.deep.equal(clearData);
  });
});
