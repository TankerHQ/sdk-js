// @flow

import sinon from 'sinon';
import varint from 'varint';

import { utils, aead, tcrypto, type Key } from '@tanker/crypto';
import { expect } from './chai';
import StreamDecryptor from '../DataProtection/StreamDecryptor';
import { defaultBlockSize } from '../DataProtection/StreamEncryptor';
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

async function flush(stream: StreamDecryptor) {
  // eslint-disable-next-line no-underscore-dangle
  await stream._onData(stream._outputBuffer);
  // eslint-disable-next-line no-underscore-dangle, no-param-reassign
  stream._outputBuffer = new Uint8Array(0);
}

describe('Stream Decryptor', () => {
  let buffer: Array<Uint8Array> = [];

  const callbacks = {
    onData: (data) => {
      buffer.push(data);
    },
    onEnd: sinon.spy(),
    blockSize: defaultBlockSize
  };

  before(() => {
    sinon.spy(callbacks, 'onData');
  });

  afterEach(() => {
    callbacks.onData.resetHistory();
    callbacks.onEnd.resetHistory();
    callbacks.blockSize = defaultBlockSize;
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
    await flush(stream);
    await expect(stream.write(msg2.encrypted)).to.not.be.rejectedWith();
    await stream.close();

    expect(callbacks.onEnd.calledOnce).to.be.true;

    expect(buffer[0]).to.deep.equal(msg1.clear);
    expect(buffer[1]).to.deep.equal(msg2.clear);
  });

  it('can extract resourceId from format header v1', async () => {
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
    await stream.close();

    expect(mapper.findKey.withArgs(resourceId).calledOnce).to.be.true;
    expect(buffer[0]).to.deep.equal(msg.clear);
  });

  it('buffers output', async () => {
    const key = utils.fromString('12345678123456781234567812345678');
    const mapper = {
      findKey: () => Promise.resolve(key)
    };
    const msg = await encryptMsg(key, 0, 'message');
    callbacks.blockSize = 5;

    let decryptedRessource = new Uint8Array(0);
    const stream = new StreamDecryptor(mapper, callbacks);
    setKey(stream, key);

    await expect(stream.write(msg.encrypted)).to.not.be.rejectedWith();

    for (let i = 0; i < buffer.length; i++) {
      expect(buffer[i].length).to.be.equal(5);
      decryptedRessource = utils.concatArrays(decryptedRessource, buffer[i]);
    }

    await stream.close();
    decryptedRessource = utils.concatArrays(decryptedRessource, buffer[buffer.length - 1]);

    expect(decryptedRessource).to.deep.equal(msg.clear);
  });
});
