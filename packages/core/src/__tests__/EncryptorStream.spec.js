// @flow
import { aead, random, tcrypto, utils } from '@tanker/crypto';

import { expect } from './chai';
import EncryptorStream from '../DataProtection/EncryptorStream';
import { InvalidArgument } from '../errors';
import PromiseWrapper from '../PromiseWrapper';
import { currentStreamVersion, getResourceId, extractHeaderV4 } from '../Resource/ResourceManager';

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

  const splitArray = (a: Uint8Array, index: number): [Uint8Array, Uint8Array] => {
    const head = a.subarray(0, index);
    const tail = a.subarray(index);
    return [head, tail];
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

    const { header } = extractHeaderV4(buffer[0]);

    expect(header.version).to.equal(currentStreamVersion);
    expect(header.resourceId).to.deep.equal(resourceId);
    expect(typeof header.encryptedChunkSize).to.equal('number');
  });

  it('outputs a resource from which you can directly get the resource id', async () => {
    const stream = new EncryptorStream(resourceId, key);
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    expect(getResourceId(buffer[0])).to.deep.equal(resourceId);
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
    const { data, header } = extractHeaderV4(buffer[0]);

    expect(header.resourceId).to.deep.equal(resourceId);

    const eMsg = data.subarray(tcrypto.XCHACHA_IV_SIZE);
    const ivSeed = data.subarray(0, tcrypto.XCHACHA_IV_SIZE);
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
      const { data, header } = extractHeaderV4(chunk);
      expect(header.version).to.equal(currentStreamVersion);
      expect(header.encryptedChunkSize).to.equal(encryptedChunkSize);
      expect(header.resourceId).to.deep.equal(resourceId);

      const [ivSeed, eMsg] = splitArray(data, tcrypto.XCHACHA_IV_SIZE);
      const iv = tcrypto.deriveIV(ivSeed, index);

      // Last chunk is an empty chunk added to check integrity (data has not been truncated)
      const expectedMsg = index === 2 ? new Uint8Array(0) : msg;
      expect(aead.decryptAEAD(key, iv, eMsg)).to.deep.equal(expectedMsg);
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
      const { data, header } = extractHeaderV4(chunk);
      expect(header.version).to.equal(currentStreamVersion);
      expect(header.encryptedChunkSize).to.equal(encryptedChunkSize);
      expect(header.resourceId).to.deep.equal(resourceId);

      const [ivSeed, eMsg] = splitArray(data, tcrypto.XCHACHA_IV_SIZE);
      const iv = tcrypto.deriveIV(ivSeed, index);

      const expectedMsg = index === 2 ? msg.subarray(1) : msg;
      expect(aead.decryptAEAD(key, iv, eMsg)).to.deep.equal(expectedMsg);
    });
  });
});
