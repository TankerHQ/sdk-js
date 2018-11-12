// @flow

import sinon from 'sinon';

import { utils, tcrypto, aead } from '@tanker/crypto';

import { expect } from './chai';
import StreamEncryptor from '../DataProtection/StreamEncryptor';
import { defaultBlockSize } from '../Uint8Stream';

describe('Stream Encryptor', () => {
  let buffer: Array<Uint8Array> = [];
  const smallBlockSize = 5;

  const streamParameters = {
    onData: (data) => {
      buffer.push(data);
    },
    onEnd: sinon.spy(),
    blockSize: defaultBlockSize
  };


  before(() => {
    sinon.spy(streamParameters, 'onData');
  });

  afterEach(() => {
    streamParameters.onData.resetHistory();
    streamParameters.onEnd.resetHistory();
    streamParameters.blockSize = defaultBlockSize;
    buffer = [];
  });

  it('can give its associated resourceId', () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const resourceId = new Uint8Array(tcrypto.MAC_SIZE);

    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    expect(stream.resourceId()).to.be.equal(utils.toBase64(resourceId));
  });

  it('derives its key and push metas before encryption', async () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const resourceId = new Uint8Array(tcrypto.MAC_SIZE);
    const msg = utils.fromString('message');

    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    await expect(stream.write(msg)).to.be.fulfilled;
    expect(streamParameters.onEnd.notCalled).to.be.true;
    await stream.close();

    expect(buffer[0].subarray(1, tcrypto.MAC_SIZE + 1)).to.deep.equal(resourceId);

    expect(streamParameters.onData.calledWith(msg)).to.be.false;
    expect(streamParameters.onEnd.calledOnce).to.be.true;
    await expect(aead.decryptAEADv2(key, buffer[0].subarray(tcrypto.MAC_SIZE + 1))).to.be.rejectedWith();
    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 0), buffer[0].subarray(tcrypto.MAC_SIZE + 1))).to.deep.equal(msg);
  });

  it('forwards blocks of specified size to onData', async () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const resourceId = new Uint8Array(tcrypto.MAC_SIZE);
    const msg = utils.fromString('message');
    streamParameters.blockSize = smallBlockSize;

    let encryptedResource = new Uint8Array(0);
    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    await expect(stream.write(msg)).to.be.fulfilled;
    await stream.close();

    for (let i = 0; i < buffer.length - 1; i++) {
      expect(buffer[i].length).to.be.equal(smallBlockSize);
      encryptedResource = utils.concatArrays(encryptedResource, buffer[i]);
    }
    encryptedResource = utils.concatArrays(encryptedResource, buffer[buffer.length - 1]);

    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 0), encryptedResource.subarray(tcrypto.MAC_SIZE + 1))).to.deep.equal(msg);
  });

  it('forwards blocks of specified size to onData even when no data is written', async () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const resourceId = new Uint8Array(tcrypto.MAC_SIZE);
    streamParameters.blockSize = 1;

    let encryptedResource = new Uint8Array(0);
    const stream = new StreamEncryptor(resourceId, key, streamParameters);
    await stream.close();

    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i].length).to.be.equal(1);
      encryptedResource = utils.concatArrays(encryptedResource, buffer[i]);
    }

    expect(encryptedResource.subarray(1)).to.deep.equal(resourceId);
  });
});
