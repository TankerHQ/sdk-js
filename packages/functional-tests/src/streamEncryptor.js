// @flow
import uuid from 'uuid';
import { utils } from '@tanker/crypto';
import { errors } from '@tanker/core';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateStreamEncryptorTests = (args: TestArgs) => {
  describe('StreamEncryptor', () => {
    let aliceId;
    let bobId;
    let aliceToken;
    let bobToken;

    beforeEach(async () => {
      aliceId = uuid.v4();
      bobId = uuid.v4();
      aliceToken = args.trustchainHelper.generateUserToken(aliceId);
      bobToken = args.trustchainHelper.generateUserToken(bobId);
      await args.aliceLaptop.open(aliceId, aliceToken);
      await args.bobLaptop.open(bobId, bobToken);
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
        let encryptedData = new Uint8Array(0);
        let decryptedData = '';
        const onEnd = () => { };

        const encryptor = await args.aliceLaptop.makeStreamEncryptor({
          onData: (data) => { encryptedData = data; },
          onEnd,
          shareOptions: {
            shareWithUsers: [bobId]
          }
        });
        await encryptor.write(utils.fromString(letterContents));
        await encryptor.close();

        const decryptor = await args.bobLaptop.makeStreamDecryptor({
          onData: (data) => { decryptedData = utils.toString(data); },
          onEnd
        });
        await decryptor.write(encryptedData);
        await decryptor.close();

        expect(decryptedData).to.equal(letterContents);
      });

      it('can postpone share', async () => {
        const letterContents = 'Secret message';
        let encryptedData = new Uint8Array(0);
        let decryptedData = '';
        const onEnd = () => { };

        const encryptor = await args.aliceLaptop.makeStreamEncryptor({
          onData: (data) => { encryptedData = data; },
          onEnd
        });
        await encryptor.write(utils.fromString(letterContents));
        await encryptor.close();

        const resourceId = encryptor.resourceId();
        await args.aliceLaptop.share([resourceId], { shareWithUsers: [bobId] });

        const decryptor = await args.bobLaptop.makeStreamDecryptor({
          onData: (data) => { decryptedData = utils.toString(data); },
          onEnd
        });
        await decryptor.write(encryptedData);
        await decryptor.close();

        expect(decryptedData).to.equal(letterContents);
      });
    });

    describe('Encryption/Decryption', () => {
      it('can encrypt/decrypt a resource in multiple \'write\'', async () => {
        const letterContents = ['Harder', 'Better', 'Faster', 'Stronger'];
        const encryptedData = [];
        let decryptedData = '';
        const onEnd = () => { };

        const encryptor = await args.aliceLaptop.makeStreamEncryptor({
          onData: (data) => { encryptedData.push(data); },
          onEnd,
        });
        for (const word of letterContents)
          await encryptor.write(utils.fromString(word));
        await encryptor.close();

        const decryptor = await args.aliceLaptop.makeStreamDecryptor({
          onData: (data) => { decryptedData = `${decryptedData}${utils.toString(data)}`; },
          onEnd
        });
        for (const eData of encryptedData)
          await decryptor.write(eData);
        await decryptor.close();

        expect(decryptedData).to.equal(letterContents.join(''));
      });

      it('can encrypt/decrypt large resources (data size > MB)', async () => {
        const clearData = new Uint8Array(10000000);
        clearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 100);
        clearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 1000);
        clearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 9000000);

        const encryptedData = [];
        const decryptedData = [];
        const onEnd = () => { };

        const encryptor = await args.aliceLaptop.makeStreamEncryptor({
          onData: (data) => { encryptedData.push(data); },
          onEnd,
        });
        await encryptor.write(clearData);
        await encryptor.close();

        const decryptor = await args.aliceLaptop.makeStreamDecryptor({
          onData: (data) => { decryptedData.push(data); },
          onEnd
        });
        for (const eData of encryptedData)
          await decryptor.write(eData);
        await decryptor.close();

        let offset = 0;
        for (const cData of decryptedData) {
          expect(cData).to.deep.equal(clearData.subarray(offset, offset + cData.length));
          offset += cData.length;
        }
      });
    });

    describe('Error Handling', () => {
      it('cannot makeStreamEncryptor and makeStreamDecryptor when session is closed', async () => {
        await args.aliceLaptop.close();
        await expect(args.aliceLaptop.makeStreamEncryptor({
          onData: () => {},
          onEnd: () => {},
        })).to.be.rejectedWith(errors.InvalidSessionStatus);

        await expect(args.aliceLaptop.makeStreamDecryptor({
          onData: () => {},
          onEnd: () => {}
        })).to.be.rejectedWith(errors.InvalidSessionStatus);
      });

      it('throws ResourceNotFound when resource was not shared to user', async () => {
        const encryptedData = [];
        const onEnd = () => { };

        const encryptor = await args.aliceLaptop.makeStreamEncryptor({
          onData: (data) => { encryptedData.push(data); },
          onEnd,
        });
        await encryptor.close();

        const decryptor = await args.bobLaptop.makeStreamDecryptor({
          onData: () => { },
          onEnd: () => { }
        });

        await expect(decryptor.write(encryptedData[0])).to.be.rejectedWith(errors.ResourceNotFound);
      });
    });
  });
};

export default generateStreamEncryptorTests;
