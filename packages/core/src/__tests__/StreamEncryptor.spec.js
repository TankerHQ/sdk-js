// @flow

import sinon from 'sinon';

import { utils, tcrypto, aead } from '@tanker/crypto';

import { expect } from './chai';
import StreamEncryptor from '../DataProtection/StreamEncryptor';
import { defaultOutputSize } from '../DataProtection/StreamConfigs';
import { InvalidArgument, StreamAlreadyClosed, BrokenStream } from '../errors';
import PromiseWrapper from '../PromiseWrapper';

describe('Stream Encryptor', () => {
  let buffer: Array<Uint8Array>;
  let smallOutputSize;

  let streamParameters;

  let key;
  let resourceId;

  before(() => {
    buffer = [];
    smallOutputSize = 5;
    streamParameters = {
      onData: (data) => {
        buffer.push(data);
      },
      onEnd: sinon.spy(),
      blockSize: defaultOutputSize
    };

    sinon.spy(streamParameters, 'onData');

    key = utils.fromString('12345678123456781234567812345678');
    resourceId = new Uint8Array(tcrypto.MAC_SIZE);
  });

  afterEach(() => {
    streamParameters.onData.resetHistory();
    streamParameters.onEnd.resetHistory();
    streamParameters.blockSize = defaultOutputSize;
    buffer = [];
  });

  it('throws InvalidArgument when writing anything else than Uint8Array', async () => {
    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    // $FlowExpectedError
    await expect(stream.write(undefined)).to.be.rejectedWith(InvalidArgument);
    // $FlowExpectedError
    await expect(stream.write(10)).to.be.rejectedWith(InvalidArgument);
    // $FlowExpectedError
    await expect(stream.write(null)).to.be.rejectedWith(InvalidArgument);
    // $FlowExpectedError
    await expect(stream.write('fail')).to.be.rejectedWith(InvalidArgument);
    // $FlowExpectedError
    await expect(stream.write({})).to.be.rejectedWith(InvalidArgument);
  });

  it('throws StreamAlreadyClosed when a second close is called', async () => {
    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    await expect(stream.close()).to.be.fulfilled;
    await expect(stream.close()).to.be.rejectedWith(StreamAlreadyClosed);
  });

  it('throws StreamAlreadyClosed when write is called after close', async () => {
    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    await expect(stream.close()).to.be.fulfilled;
    await expect(stream.write(new Uint8Array(10))).to.be.rejectedWith(StreamAlreadyClosed);
  });

  it('forwards \'onData\' errors to \'onError\'', async () => {
    const error = new Error('an error');
    const sync = new PromiseWrapper();
    let resultError;

    const encryptor = new StreamEncryptor(resourceId, key, {
      onData: () => { throw error; },
      onEnd: () => { },
      onError: async (err) => {
        resultError = err;
        sync.resolve();
      }
    });

    await encryptor.write(new Uint8Array(40));
    await expect(encryptor.close()).to.be.rejectedWith(BrokenStream);

    await sync.promise;
    await expect(resultError).to.equal(error);
  });

  it('can give its associated resourceId', () => {
    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    expect(stream.resourceId()).to.be.equal(utils.toBase64(resourceId));
  });

  it('derives its key and push header before encryption', async () => {
    const msg = utils.fromString('message');
    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    await expect(stream.write(msg)).to.be.fulfilled;
    expect(streamParameters.onEnd.notCalled).to.be.true;
    await stream.close();

    const header = buffer[0].subarray(0, tcrypto.MAC_SIZE + 1);
    const eMsg = buffer[0].subarray(tcrypto.MAC_SIZE + 1);

    expect(header.subarray(1)).to.deep.equal(resourceId);

    expect(streamParameters.onData.calledWith(msg)).to.be.false;
    expect(streamParameters.onEnd.calledOnce).to.be.true;

    await expect(aead.decryptAEADv2(key, eMsg)).to.not.be.fulfilled;
    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 0), eMsg)).to.deep.equal(msg);
  });

  it('encrypts block of fixed size', async () => {
    const msg = utils.fromString('message');

    const stream = new StreamEncryptor(resourceId, key, streamParameters, msg.length);
    await expect(stream.write(msg.subarray(0, 5))).to.be.fulfilled;
    await expect(stream.write(msg.subarray(5))).to.be.fulfilled;
    await expect(stream.write(msg)).to.be.fulfilled;
    await expect(stream.write(msg.subarray(1))).to.be.fulfilled;

    await stream.close();

    let offset = tcrypto.MAC_SIZE + 1;
    const eLength = msg.length + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD;
    const emsg1 = buffer[0].subarray(offset, offset + eLength);
    offset += eLength;
    const emsg2 = buffer[0].subarray(offset, offset + eLength);
    offset += eLength;
    const emsg3 = buffer[0].subarray(offset, offset + eLength);

    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 0), emsg1)).to.deep.equal(msg);
    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 1), emsg2)).to.deep.equal(msg);
    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 2), emsg3)).to.deep.equal(msg.subarray(1));
  });

  it('forwards blocks of specified size to onData', async () => {
    const msg = utils.fromString('message');
    streamParameters.blockSize = smallOutputSize;

    let encryptedResource = new Uint8Array(0);
    const stream = new StreamEncryptor(resourceId, key, streamParameters);

    await expect(stream.write(msg)).to.be.fulfilled;
    await stream.close();

    for (let i = 0; i < buffer.length - 1; i++) {
      expect(buffer[i].length).to.be.equal(smallOutputSize);
      encryptedResource = utils.concatArrays(encryptedResource, buffer[i]);
    }
    encryptedResource = utils.concatArrays(encryptedResource, buffer[buffer.length - 1]);

    expect(await aead.decryptAEADv2(tcrypto.deriveKey(key, 0), encryptedResource.subarray(tcrypto.MAC_SIZE + 1))).to.deep.equal(msg);
  });

  it('forwards blocks of specified size to onData even when no data is written', async () => {
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
