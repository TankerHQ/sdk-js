// @flow
import { utils } from '@tanker/crypto';
import { errors } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateEncryptorStreamTests = (args: TestArgs) => {
  describe('EncryptorStream', () => {
    let bobPublicIdentity;

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
      const aliceIdentity = args.trustchainHelper.generateIdentity();
      const bobIdentity = args.trustchainHelper.generateIdentity();
      bobPublicIdentity = getPublicIdentity(bobIdentity);
      await args.aliceLaptop.open(aliceIdentity);
      await args.bobLaptop.open(bobIdentity);
    });

    afterEach(async () => {
      await Promise.all([
        args.aliceLaptop.close(),
        args.bobLaptop.close(),
        args.bobPhone.close(),
      ]);
    });

    describe('Sharing', () => {
      it('shares a streamed resource', async () => {
        const letterContents = 'Secret message';
        let decryptedData = '';

        const encryptor = await args.aliceLaptop.makeEncryptorStream({ shareWithUsers: [bobPublicIdentity] });
        const decryptor = await args.bobLaptop.makeDecryptorStream();
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

        const encryptor = await args.aliceLaptop.makeEncryptorStream();
        const decryptor = await args.bobLaptop.makeDecryptorStream();
        const sync = watchStream(decryptor);
        decryptor.on('data', (data) => {
          decryptedData = `${decryptedData}${utils.toString(data)}`;
        });

        encryptor.write(utils.fromString(letterContents));
        encryptor.end();

        const resourceId = encryptor.resourceId();
        await args.aliceLaptop.share([resourceId], { shareWithUsers: [bobPublicIdentity] });

        encryptor.pipe(decryptor);
        await expect(sync.promise).to.be.fulfilled;

        expect(decryptedData).to.equal(letterContents);
      });
    });

    describe('Encryption/Decryption', () => {
      it('can encrypt/decrypt a resource in multiple \'write\'', async () => {
        const letterContents = ['Harder', 'Better', 'Faster', 'Stronger'];
        let decryptedData = '';

        const encryptor = await args.aliceLaptop.makeEncryptorStream();

        for (const word of letterContents)
          encryptor.write(utils.fromString(word));
        encryptor.end();

        const decryptor = await args.aliceLaptop.makeDecryptorStream();
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

        const encryptor = await args.aliceLaptop.makeEncryptorStream();
        encryptor.write(clearData);
        encryptor.end();

        const decryptor = await args.aliceLaptop.makeDecryptorStream();
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
        await args.aliceLaptop.close();
        await expect(args.aliceLaptop.makeEncryptorStream()).to.be.rejectedWith(errors.InvalidSessionStatus);
        await expect(args.aliceLaptop.makeDecryptorStream()).to.be.rejectedWith(errors.InvalidSessionStatus);
      });

      it('throws ResourceNotFound when resource was not shared to user', async () => {
        const encryptor = await args.aliceLaptop.makeEncryptorStream();
        encryptor.end();

        const decryptor = await args.bobLaptop.makeDecryptorStream();
        const sync = watchStream(decryptor);

        encryptor.pipe(decryptor);

        await expect(sync.promise).to.be.rejectedWith(errors.ResourceNotFound);
      });
    });
  });
};

export default generateEncryptorStreamTests;
