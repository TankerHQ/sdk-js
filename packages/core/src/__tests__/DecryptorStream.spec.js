// @flow

import sinon from 'sinon';
import varint from 'varint';

import { utils, aead, tcrypto, type Key } from '@tanker/crypto';
import { expect } from './chai';
import DecryptorStream from '../DataProtection/DecryptorStream';
import { concatArrays } from '../Blocks/Serialize';
import { NotEnoughData, InvalidEncryptionFormat, DecryptFailed } from '../errors';
import PromiseWrapper from '../PromiseWrapper';

async function encryptMsg(key, index, str) {
  const msg = utils.fromString(str);
  return {
    clear: msg,
    encrypted: await aead.encryptAEADv2(tcrypto.deriveKey(key, index), msg)
  };
}

function setKey(stream: DecryptorStream, key: Key) {
  // eslint-disable-next-line no-underscore-dangle, no-param-reassign
  stream._state.resourceIdKeyPair = {
    key,
    resourceId: new Uint8Array(tcrypto.MAC_SIZE)
  };
}

describe('Decryptor Stream', () => {
  let buffer: Array<Uint8Array>;
  let key;
  let mapper;

  const watchStream = (stream) => {
    const sync = new PromiseWrapper();
    stream.on('data', (data) => buffer.push(data));
    stream.on('error', (err) => sync.reject(err));
    stream.on('end', () => sync.resolve());
    return sync;
  };

  before(() => {
    key = utils.fromString('12345678123456781234567812345678');
    mapper = {
      findKey: () => Promise.resolve(key)
    };
  });

  beforeEach(() => {
    buffer = [];
  });

  it('derives its key and decrypt chunk of fixed size', async () => {
    const msg1 = await encryptMsg(key, 0, '1st message');
    const msg2 = await encryptMsg(key, 1, '2nd message');
    const encryptedMsgLength = msg1.encrypted.length;

    const stream = new DecryptorStream(mapper, encryptedMsgLength);
    const sync = watchStream(stream);

    setKey(stream, key);

    stream.write(msg1.encrypted);
    stream.write(msg2.encrypted);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    const res1 = buffer[0];
    const res2 = buffer[1];
    expect(res1).to.deep.equal(msg1.clear);
    expect(res2).to.deep.equal(msg2.clear);
  });

  it('can extract resourceId from format header v4', async () => {
    const spy = sinon.spy(mapper, 'findKey');

    const resourceId = utils.fromString('1234567812345678');
    const formatHeader = concatArrays(varint.encode(4), resourceId);
    const msg = await encryptMsg(key, 0, 'message');

    const encryptedMsgLength = msg.encrypted.length;
    const stream = new DecryptorStream(mapper, encryptedMsgLength);
    const sync = watchStream(stream);

    stream.write(concatArrays(formatHeader, msg.encrypted));
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(mapper.findKey.withArgs(resourceId).calledOnce).to.be.true;
    expect(buffer[0]).to.deep.equal(msg.clear);

    spy.restore();
  });

  describe('Errors', () => {
    let ref;

    beforeEach(async () => {
      ref = [];
      const msg1 = await encryptMsg(key, 0, '1st message');
      const msg2 = await encryptMsg(key, 1, '2nd message');
      const resourceId = utils.fromString('1234567812345678');
      const header = concatArrays(varint.encode(4), resourceId);

      ref.push(header);
      ref.push(msg1.encrypted);
      ref.push(msg2.encrypted);
    });

    it('throws DecryptFailed when data is corrupted', async () => {
      const stream = new DecryptorStream(mapper, ref[1].length);
      const sync = watchStream(stream);

      ref[1][0] += 1;
      stream.write(ref[0]); // header
      stream.write(ref[1]); // corrupted chunk

      await expect(sync.promise).to.be.rejectedWith(DecryptFailed);
    });

    it('throws NotEnoughData when the header is not fully given during first write', async () => {
      const stream = new DecryptorStream(mapper, ref[1].length);
      const sync = watchStream(stream);

      const incompleteHeader = ref[0].subarray(0, 1);
      stream.write(incompleteHeader);
      await expect(sync.promise).to.be.rejectedWith(NotEnoughData);
    });

    it('throws InvalidEncryptionFormat when the header is corrupted', async () => {
      const stream = new DecryptorStream(mapper, ref[1].length);
      const sync = watchStream(stream);
      ref[0][0] += 1;

      stream.write(ref[0]);
      await expect(sync.promise).to.be.rejectedWith(InvalidEncryptionFormat);
    });

    it('throws DecryptFailed when data is written in wrong order', async () => {
      const stream = new DecryptorStream(mapper, ref[1].length);
      const sync = watchStream(stream);

      stream.write(ref[0]);
      stream.write(ref[2]);

      await expect(sync.promise).to.be.rejectedWith(DecryptFailed);
    });
  });
});
