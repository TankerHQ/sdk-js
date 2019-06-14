// @flow
import { utils } from '@tanker/crypto';
import { errors } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateEncryptorStreamTests = (args: TestArgs) => {
  describe('EncryptorStream', () => {
    let aliceIdentity;
    let aliceLaptop;
    let bobIdentity;
    let bobPublicIdentity;
    let bobLaptop;

    const watchStream = (stream) => {
      const sync = {};
      sync.promise = new Promise((resolve, reject) => {
        sync.resolve = resolve;
        sync.reject = reject;
      });

      stream.on('error', sync.reject);
      stream.on('end', sync.resolve);
      return sync;
    };

    beforeEach(async () => {
      aliceIdentity = await args.trustchainHelper.generateIdentity();
      bobIdentity = await args.trustchainHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      aliceLaptop = args.makeTanker();
      bobLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
      ]);
    });

    describe('Sharing', () => {
      it('shares a streamed resource', async () => {
        const letterContents = 'Secret message';
        let decryptedData = '';

        const encryptor = await aliceLaptop.makeEncryptorStream({ shareWithUsers: [bobPublicIdentity] });
        const decryptor = await bobLaptop.makeDecryptorStream();
        const sync = watchStream(decryptor);
        decryptor.on('data', (data) => {
          decryptedData = `${decryptedData}${utils.toString(data)}`;
        });

        encryptor.pipe(decryptor);

        encryptor.write(utils.fromString(letterContents));
        encryptor.end();

        await expect(sync.promise).to.be.fulfilled;
        expect(decryptedData).to.equal(letterContents);
      });

      it('can postpone share', async () => {
        const letterContents = 'Secret message';
        let decryptedData = '';

        const encryptor = await aliceLaptop.makeEncryptorStream();
        const decryptor = await bobLaptop.makeDecryptorStream();
        const sync = watchStream(decryptor);
        decryptor.on('data', (data) => {
          decryptedData = `${decryptedData}${utils.toString(data)}`;
        });

        encryptor.write(utils.fromString(letterContents));
        encryptor.end();

        const resourceId = encryptor.resourceId();
        await aliceLaptop.share([resourceId], { shareWithUsers: [bobPublicIdentity] });

        encryptor.pipe(decryptor);
        await expect(sync.promise).to.be.fulfilled;

        expect(decryptedData).to.equal(letterContents);
      });
    });

    describe('Encryption/Decryption', () => {
      it('can encrypt/decrypt a resource in multiple \'write\'', async () => {
        const letterContents = ['Harder', 'Better', 'Faster', 'Stronger'];
        let decryptedData = '';

        const encryptor = await aliceLaptop.makeEncryptorStream();

        for (const word of letterContents)
          encryptor.write(utils.fromString(word));
        encryptor.end();

        const decryptor = await aliceLaptop.makeDecryptorStream();
        const sync = watchStream(decryptor);
        decryptor.on('data', (data) => {
          decryptedData = `${decryptedData}${utils.toString(data)}`;
        });

        encryptor.pipe(decryptor);

        await expect(sync.promise).to.be.fulfilled;
        expect(decryptedData).to.equal(letterContents.join(''));
      });

      it('can encrypt/decrypt large resources (data size > MB)', async () => {
        const clearData = new Uint8Array(10000000);
        clearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 100);
        clearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 1000);
        clearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 9000000);

        const decryptedData = [];

        const encryptor = await aliceLaptop.makeEncryptorStream();
        encryptor.write(clearData);
        encryptor.end();

        const decryptor = await aliceLaptop.makeDecryptorStream();
        const sync = watchStream(decryptor);
        decryptor.on('data', (data) => decryptedData.push(data));

        encryptor.pipe(decryptor);
        await expect(sync.promise).to.be.fulfilled;

        let offset = 0;
        for (const cData of decryptedData) {
          expect(cData).to.deep.equal(clearData.subarray(offset, offset + cData.length));
          offset += cData.length;
        }
      });
    });

    describe('Error Handling', () => {
      it('cannot makeEncryptorStream and makeDecryptorStream when session has ended', async () => {
        await aliceLaptop.stop();
        await expect(aliceLaptop.makeEncryptorStream()).to.be.rejectedWith(errors.PreconditionFailed);
        await expect(aliceLaptop.makeDecryptorStream()).to.be.rejectedWith(errors.PreconditionFailed);
      });

      it('throws InvalidArgument when resource was not shared with user', async () => {
        const encryptor = await aliceLaptop.makeEncryptorStream();
        encryptor.end();

        const decryptor = await bobLaptop.makeDecryptorStream();
        const sync = watchStream(decryptor);

        encryptor.pipe(decryptor);

        await expect(sync.promise).to.be.rejectedWith(errors.InvalidArgument);
      });
    });
  });
};

export default generateEncryptorStreamTests;
