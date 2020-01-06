// @flow
import { aead, random, tcrypto, utils, encryptionV4 } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import EncryptorStream from '../EncryptorStream';
import PromiseWrapper from '../../PromiseWrapper';

describe('Encryptor Stream', () => {
  const headerV4Length = 21;

  let buffer: Array<Uint8Array>;
  let key;
  let resourceId;

  const watchStream = (stream) => {
    const sync = new PromiseWrapper();
    stream.on('data', (data) => buffer.push(data));
    stream.on('error', (err) => sync.reject(err));
    stream.on('end', () => sync.resolve());
    return sync;
  };

  before(() => {
    key = utils.fromString('12345678123456781234567812345678');
    resourceId = random(tcrypto.MAC_SIZE);
  });

  beforeEach(() => {
    buffer = [];
  });

  it('throws InvalidArgument when writing anything else than Uint8Array', async () => {
    const stream = new EncryptorStream(resourceId, key);
    const sync = watchStream(stream);

    stream.write('fail');
    stream.end();

    await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
  });

  it('can give its associated resourceId', async () => {
    const stream = new EncryptorStream(resourceId, key);
    const sync = watchStream(stream);

    expect(stream.resourceId).to.be.equal(utils.toBase64(resourceId));

    stream.end();
    await sync.promise;
  });

  it('outputs a resource from which you can read the header', async () => {
    const stream = new EncryptorStream(resourceId, key);
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    const data = encryptionV4.unserialize(buffer[0]);

    expect(data.resourceId).to.deep.equal(resourceId);
    expect(typeof data.encryptedChunkSize).to.equal('number');
  });

  it('outputs a resource from which you can directly get the resource id', async () => {
    const stream = new EncryptorStream(resourceId, key);
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    expect(encryptionV4.extractResourceId(buffer[0])).to.deep.equal(resourceId);
  });

  it('derives its iv and push header before encryption', async () => {
    const msg = utils.fromString('message');
    const stream = new EncryptorStream(resourceId, key);
    const sync = watchStream(stream);

    stream.write(msg);

    expect(sync.settled).to.be.false;

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.be.equal(1);
    const data = encryptionV4.unserialize(buffer[0]);

    expect(data.resourceId).to.deep.equal(resourceId);

    const eMsg = data.encryptedData;
    const ivSeed = data.ivSeed;
    const iv = tcrypto.deriveIV(ivSeed, 0);

    expect(() => aead.decryptAEAD(key, ivSeed, eMsg)).to.throw();
    expect(aead.decryptAEAD(key, iv, eMsg)).to.deep.equal(msg);
  });

  it('encrypts chunks of fixed size', async () => {
    const msg = utils.fromString('message');

    const encryptedChunkSize = msg.length + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD + headerV4Length;

    const stream = new EncryptorStream(resourceId, key, encryptedChunkSize);
    const sync = watchStream(stream);

    // push msg twice
    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(3);

    buffer.forEach((chunk, index) => {
      const clearData = encryptionV4.decrypt(key, index, encryptionV4.unserialize(buffer[index]));
      const expectedMsg = index === 2 ? new Uint8Array(0) : msg;
      expect(clearData).to.deep.equal(expectedMsg);
    });
  });

  it('encrypts chunks of fixed size except last one', async () => {
    const msg = utils.fromString('message');

    const encryptedChunkSize = msg.length + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD + headerV4Length;

    const stream = new EncryptorStream(resourceId, key, encryptedChunkSize);
    const sync = watchStream(stream);

    // push msg twice + 1 more byte
    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);
    stream.write(msg.subarray(1));

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(3);

    buffer.forEach((chunk, index) => {
      const clearData = encryptionV4.decrypt(key, index, encryptionV4.unserialize(buffer[index]));
      const expectedMsg = index === 2 ? msg.subarray(1) : msg;
      expect(clearData).to.deep.equal(expectedMsg);
    });
  });
});
