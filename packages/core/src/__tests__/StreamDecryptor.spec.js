// @flow

import sinon from 'sinon';
import varint from 'varint';

import { utils, aead, tcrypto, type Key } from '@tanker/crypto';
import { expect } from './chai';
import StreamDecryptor from '../DataProtection/StreamDecryptor';
import { concatArrays } from '../Blocks/Serialize';

async function encryptMsg(key, index, str) {
  const msg = utils.fromString(str);
  return {
    clear: msg,
    encrypted: await aead.encryptAEADv2(tcrypto.deriveKey(key, index), msg)
  };
}

function setKey(stream: StreamDecryptor, key: Key) {
  // eslint-disable-next-line no-underscore-dangle, no-param-reassign
  stream._resourceIdKeyPair = {
    key,
    resourceId: new Uint8Array(tcrypto.MAC_SIZE)
  };
}

describe('Stream Decryptor', () => {
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

  it('derives its key and decrypt data', async () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const mapper = {
      findKey: () => Promise.resolve(key)
    };

    const msg1 = await encryptMsg(key, 0, 'first message');
    const msg2 = await encryptMsg(key, 1, 'second message');

    const stream = new StreamDecryptor(mapper, callbacks);

    setKey(stream, key);

    await expect(stream.write(msg1.encrypted)).to.not.be.rejectedWith();
    await expect(stream.write(msg2.encrypted)).to.not.be.rejectedWith();

    await stream.close();

    expect(callbacks.onEnd.calledOnce).to.be.true;

    expect(buffer[0]).to.deep.equal(msg1.clear);
    expect(buffer[1]).to.deep.equal(msg2.clear);
  });

  it('can exctract resourceId from format header V1', async () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const mapper = {
      findKey: () => Promise.resolve(key)
    };
    sinon.spy(mapper, 'findKey');

    const resourceId = utils.fromString('1234567812345678');
    const formatHeader = concatArrays(varint.encode(1), resourceId);
    const msg = await encryptMsg(key, 0, 'message');

    const stream = new StreamDecryptor(mapper, callbacks);


    await expect(stream.write(concatArrays(formatHeader, msg.encrypted))).to.not.be.rejectedWith();

    expect(mapper.findKey.withArgs(resourceId).calledOnce).to.be.true;
    expect(buffer[0]).to.deep.equal(msg.clear);
  });
});
