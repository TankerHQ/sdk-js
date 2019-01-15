// @flow

import { aead, random, tcrypto, utils } from '@tanker/crypto';

import { expect } from './chai';
import EncryptorStream from '../DataProtection/EncryptorStream';
import { InvalidArgument } from '../errors';
import PromiseWrapper from '../PromiseWrapper';
import { getResourceId } from '../Resource/ResourceManager';

describe('Encryptor Stream', () => {
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

    expect(stream.resourceId()).to.be.equal(utils.toBase64(resourceId));

    stream.end();
    await sync.promise;
  });

  it('outputs a resource from which you can get the resource id', async () => {
    const stream = new EncryptorStream(resourceId, key);
    const sync = watchStream(stream);
    stream.end();
    await sync.promise;

    expect(getResourceId(buffer[0])).to.deep.equal(resourceId);
  });

  it('derives its key and push header before encryption', async () => {
    const msg = utils.fromString('message');
    const stream = new EncryptorStream(resourceId, key);
    const sync = watchStream(stream);

    stream.write(msg);

    expect(sync.settled).to.be.false;

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.be.equal(2);
    const header = buffer[0];
    const eMsg = buffer[1];

    expect(header.subarray(1)).to.deep.equal(resourceId);

    await expect(aead.decryptAEADv2(key, eMsg)).to.be.rejected;
    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 0), eMsg)).to.deep.equal(msg);
  });

  it('encrypts chunks of fixed size', async () => {
    const msg = utils.fromString('message');

    const stream = new EncryptorStream(resourceId, key, msg.length);
    const sync = watchStream(stream);

    stream.write(msg.subarray(0, 5));
    stream.write(msg.subarray(5));
    stream.write(msg);
    stream.write(msg.subarray(1));

    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.be.equal(4);
    const emsg1 = buffer[1];
    const emsg2 = buffer[2];
    const emsg3 = buffer[3];

    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 0), emsg1)).to.deep.equal(msg);
    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 1), emsg2)).to.deep.equal(msg);
    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 2), emsg3)).to.deep.equal(msg.subarray(1));
  });
});
