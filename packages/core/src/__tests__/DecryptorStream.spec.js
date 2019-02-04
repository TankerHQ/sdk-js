// @flow
import sinon from 'sinon';

import { utils, aead, random, tcrypto } from '@tanker/crypto';
import { expect } from './chai';
import DecryptorStream from '../DataProtection/DecryptorStream';
import { concatArrays } from '../Blocks/Serialize';
import { InvalidArgument, NotEnoughData, InvalidEncryptionFormat, DecryptFailed } from '../errors';
import PromiseWrapper from '../PromiseWrapper';
import { currentStreamVersion, serializeHeaderV4 } from '../Resource/ResourceManager';

describe('Decryptor Stream', () => {
  let buffer: Array<Uint8Array>;
  let key;
  let resourceId;
  let mapper;
  let stream;
  let sync;

  const watchStream = (str) => {
    const pw = new PromiseWrapper();
    buffer = [];
    str.on('data', (data) => buffer.push(data));
    str.on('error', (err) => pw.reject(err));
    str.on('end', () => pw.resolve());
    return pw;
  };

  const encryptMsg = (index, str) => {
    const clear = utils.fromString(str);
    const header = serializeHeaderV4({
      version: currentStreamVersion,
      resourceId,
      encryptedChunkSize: clear.length + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD + 21,
    });
    const ivSeed = random(tcrypto.XCHACHA_IV_SIZE);
    const iv = tcrypto.deriveIV(ivSeed, index);
    const encrypted = concatArrays(header, ivSeed, aead.encryptAEAD(key, iv, clear));
    return { clear, encrypted };
  };

  before(() => {
    key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    resourceId = random(16);
    mapper = {
      findKey: () => Promise.resolve(key)
    };
  });

  beforeEach(() => {
    stream = new DecryptorStream(mapper);
    sync = watchStream(stream);
  });

  it('can extract header v4 and resource id', async () => {
    const spy = sinon.spy(mapper, 'findKey');
    const msg = encryptMsg(0, '1st message');
    const emptyMsg = encryptMsg(1, '');

    stream.write(concatArrays(msg.encrypted, emptyMsg.encrypted));
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(mapper.findKey.withArgs(resourceId).calledOnce).to.be.true;
    expect(buffer[0]).to.deep.equal(msg.clear);

    spy.restore();
  });

  it('can decrypt chunks of fixed size', async () => {
    const msg1 = encryptMsg(0, '1st message');
    const msg2 = encryptMsg(1, '2nd message');
    const emptyMsg = encryptMsg(2, '');

    stream.write(msg1.encrypted.subarray(0, 21));
    stream.write(msg1.encrypted.subarray(21));
    stream.write(msg2.encrypted);
    stream.write(emptyMsg.encrypted);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(2);
    expect(buffer[0]).to.deep.equal(msg1.clear);
    expect(buffer[1]).to.deep.equal(msg2.clear);
  });

  it('can decrypt chunks of fixed size except last one', async () => {
    const msg1 = encryptMsg(0, '1st message');
    const msg2 = encryptMsg(1, '2nd');

    stream.write(msg1.encrypted.subarray(0, 21));
    stream.write(msg1.encrypted.subarray(21));
    stream.write(msg2.encrypted);
    stream.end();

    await expect(sync.promise).to.be.fulfilled;

    expect(buffer.length).to.equal(2);
    expect(buffer[0]).to.deep.equal(msg1.clear);
    expect(buffer[1]).to.deep.equal(msg2.clear);
  });

  describe('Errors', () => {
    let chunks;

    beforeEach(async () => {
      const msg1 = encryptMsg(0, '1st message');
      const msg2 = encryptMsg(1, '2nd message');
      chunks = [msg1.encrypted, msg2.encrypted];
    });

    it('throws InvalidArgument when writing anything else than Uint8Array', async () => {
      stream.write('fail');
      await expect(sync.promise).to.be.rejectedWith(InvalidArgument);
    });

    it('throws DecryptFailed when missing empty chunk after only maximum size chunks', async () => {
      stream.write(chunks[0]); // valid chunk of the maximum size
      stream.end();
      await expect(sync.promise).to.be.rejectedWith(DecryptFailed);
    });

    it('throws DecryptFailed when data is corrupted', async () => {
      chunks[0][61] += 1;
      stream.write(chunks[0]); // corrupted chunk
      await expect(sync.promise).to.be.rejectedWith(DecryptFailed);
    });

    it('throws NotEnoughData when the header is not fully given during first write', async () => {
      const incompleteHeader = chunks[0].subarray(0, 1);
      stream.write(incompleteHeader);
      await expect(sync.promise).to.be.rejectedWith(NotEnoughData);
    });

    it('throws InvalidEncryptionFormat when the header is corrupted', async () => {
      chunks[0][0] += 1;
      stream.write(chunks[0]);
      await expect(sync.promise).to.be.rejectedWith(InvalidEncryptionFormat);
    });

    it('throws DecryptFailed when data is written in wrong order', async () => {
      stream.write(chunks[1]);
      await expect(sync.promise).to.be.rejectedWith(DecryptFailed);
    });
  });
});
