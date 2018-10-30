// @flow

import sinon from 'sinon';

import { utils, tcrypto, aead } from '@tanker/crypto';

import { expect } from './chai';
import StreamEncryptor from '../DataProtection/StreamEncryptor';

describe('Stream Encryptor', () => {
  let buffer: Array<Uint8Array> = [];

  const callbacks = {
    onData: (data) => {
      buffer.push(data);
    },
    onEnd: sinon.spy()
  };


  before(() => {
    sinon.spy(callbacks, 'onData');
  });

  afterEach(() => {
    callbacks.onData.resetHistory();
    callbacks.onEnd.resetHistory();
    buffer = [];
  });

  it('can give its associated resourceId', () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const resourceId = new Uint8Array(tcrypto.MAC_SIZE);

    const stream = new StreamEncryptor(resourceId, key, callbacks);

    expect(stream.resourceId()).to.be.equal(utils.toBase64(resourceId));
  });

  it('derives its key and push metas before encryption', async () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const resourceId = new Uint8Array(tcrypto.MAC_SIZE);
    const msg = utils.fromString('message');

    const stream = new StreamEncryptor(resourceId, key, callbacks);

    await expect(stream.write(msg)).to.not.be.rejectedWith();
    await stream.close();

    expect(buffer[0].subarray(1)).to.deep.equal(resourceId);

    expect(callbacks.onData.calledWith(msg)).to.be.false;
    expect(callbacks.onEnd.calledOnce).to.be.true;
    await expect(aead.decryptAEADv2(key, buffer[1])).to.be.rejectedWith();
    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 0), buffer[1])).to.deep.equal(msg);
  });
});
