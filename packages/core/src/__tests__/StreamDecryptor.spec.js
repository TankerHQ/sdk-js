// @flow

import sinon from 'sinon';
import varint from 'varint';

import { utils, aead, tcrypto, type Key } from '@tanker/crypto';
import { expect } from './chai';
import StreamDecryptor from '../DataProtection/StreamDecryptor';
import { concatArrays } from '../Blocks/Serialize';
import { defaultOutputSize } from '../DataProtection/StreamConfigs';
import { InvalidArgument } from '../errors';

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
  let buffer: Array<Uint8Array>;
  let key;
  let mapper;
  let streamConfig;

  before(() => {
    buffer = [];
    key = utils.fromString('12345678123456781234567812345678');
    mapper = {
      findKey: () => Promise.resolve(key)
    };

    streamConfig = {
      onData: (data) => {
        buffer.push(data);
      },
      onEnd: sinon.spy(),
      blockSize: defaultOutputSize
    };

    sinon.spy(streamConfig, 'onData');
  });

  afterEach(() => {
    streamConfig.onData.resetHistory();
    streamConfig.onEnd.resetHistory();
    streamConfig.blockSize = defaultOutputSize;
    buffer = [];
  });

  it('derives its key and decrypt block of fixed size', async () => {
    const msg1 = await encryptMsg(key, 0, '1st message');
    const msg2 = await encryptMsg(key, 1, '2nd message');
    const encryptedMsgLength = msg1.encrypted.length;

    const stream = new StreamDecryptor(mapper, streamConfig, encryptedMsgLength);

    setKey(stream, key);

    await expect(stream.write(msg1.encrypted.subarray(0, 5))).to.be.fulfilled;
    await expect(stream.write(msg1.encrypted.subarray(5))).to.be.fulfilled;
    await expect(stream.write(msg2.encrypted)).to.be.fulfilled;
    await stream.close();

    expect(streamConfig.onEnd.calledOnce).to.be.true;

    const res1 = buffer[0].subarray(0, msg1.clear.length);
    const res2 = buffer[0].subarray(msg1.clear.length);
    expect(res1).to.deep.equal(msg1.clear);
    expect(res2).to.deep.equal(msg2.clear);
  });

  it('can extract resourceId from format header v1', async () => {
    const spy = sinon.spy(mapper, 'findKey');

    const resourceId = utils.fromString('1234567812345678');
    const formatHeader = concatArrays(varint.encode(1), resourceId);
    const msg = await encryptMsg(key, 0, 'message');

    const encryptedMsgLength = msg.encrypted.length;
    const stream = new StreamDecryptor(mapper, streamConfig, encryptedMsgLength);

    await expect(stream.write(concatArrays(formatHeader, msg.encrypted))).to.be.fulfilled;
    await stream.close();

    expect(mapper.findKey.withArgs(resourceId).calledOnce).to.be.true;
    expect(buffer[0]).to.deep.equal(msg.clear);

    spy.restore();
  });

  it('forwards blocks of specified size to onData', async () => {
    const msg = await encryptMsg(key, 0, 'message');
    streamConfig.blockSize = 5;

    let decryptedRessource = new Uint8Array(0);
    const stream = new StreamDecryptor(mapper, streamConfig);
    setKey(stream, key);

    await expect(stream.write(msg.encrypted)).to.be.fulfilled;
    await stream.close();

    for (let i = 0; i < buffer.length - 1; i++) {
      expect(buffer[i].length).to.be.equal(5);
      decryptedRessource = utils.concatArrays(decryptedRessource, buffer[i]);
    }

    decryptedRessource = utils.concatArrays(decryptedRessource, buffer[buffer.length - 1]);

    expect(decryptedRessource).to.deep.equal(msg.clear);
  });
});
