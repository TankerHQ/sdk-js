import { errors } from '@tanker/core';
import type { Tanker } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { utils } from '@tanker/crypto';
import type { b64string } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';
import { MergerStream } from '@tanker/stream-base';

import type { TestArgs } from './helpers';
import { pipeStreams, watchStream } from './helpers';

export const generateEncryptionStreamTests = (args: TestArgs) => {
  describe('stream encryption', () => {
    let aliceIdentity: b64string;
    let aliceLaptop: Tanker;
    let bobIdentity: b64string;
    let bobPublicIdentity: b64string;
    let bobLaptop: Tanker;
    let smallClearData: Uint8Array;
    let largeClearData: Uint8Array;

    const setupTestData = () => {
      smallClearData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      largeClearData = new Uint8Array(5 * 1024 * 1024);
      largeClearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 100);
      largeClearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 1000);
      largeClearData.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 4000000);
    };

    before(async () => {
      aliceIdentity = await args.appHelper.generateIdentity();
      bobIdentity = await args.appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      aliceLaptop = args.makeTanker();
      bobLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

      setupTestData();
    });

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
      ]);
    });

    describe('encryption and decryption', () => {
      it('can encrypt/decrypt a resource in multiple \'write\'', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream();
        encryptor.write(smallClearData.subarray(0, 2));
        encryptor.write(smallClearData.subarray(2, 5));
        encryptor.write(smallClearData.subarray(5, 10));
        encryptor.end();

        const decryptor = await aliceLaptop.createDecryptionStream();
        const watchPromise = watchStream(decryptor);

        encryptor.pipe(decryptor);

        const decryptedData = await watchPromise;
        expect(decryptedData).to.deep.equal([smallClearData]);
      });

      it('can encrypt/decrypt large resources (data size > MB)', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream();
        encryptor.write(largeClearData);
        encryptor.end();

        const decryptor = await aliceLaptop.createDecryptionStream();
        const watchPromise = watchStream(decryptor);

        encryptor.pipe(decryptor);

        const decryptedData = await watchPromise;

        let offset = 0;
        for (const cData of decryptedData) {
          expect(cData).to.deep.equal(largeClearData.subarray(offset, offset + cData.length));
          offset += cData.length;
        }
        expect(offset).to.equal(largeClearData.length);
      });
    });

    describe('sharing', () => {
      it('shares a streamed resource', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream({ shareWithUsers: [bobPublicIdentity] });
        const decryptor = await bobLaptop.createDecryptionStream();
        const watchPromise = watchStream(decryptor);

        encryptor.pipe(decryptor);

        encryptor.write(smallClearData);
        encryptor.end();

        const decryptedData = await watchPromise;
        expect(decryptedData).to.deep.equal([smallClearData]);
      });

      it('shares a streamed resource but not with self', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream({ shareWithUsers: [bobPublicIdentity], shareWithSelf: false });

        const watchPromise = watchStream(encryptor);

        encryptor.write(smallClearData);
        encryptor.end();

        const encryptedData = utils.concatArrays(...(await watchPromise));

        await expect(aliceLaptop.decrypt(encryptedData)).to.be.rejectedWith(errors.InvalidArgument);

        const decryptedData = await bobLaptop.decryptData(encryptedData);
        expect(decryptedData).to.deep.equal(smallClearData);
      });

      it('can postpone share', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream();
        const decryptor = await bobLaptop.createDecryptionStream();

        const watchPromise = watchStream(decryptor);

        encryptor.write(smallClearData);
        encryptor.end();

        const resourceId = encryptor.resourceId;
        await aliceLaptop.share([resourceId], { shareWithUsers: [bobPublicIdentity] });

        encryptor.pipe(decryptor);

        const decryptedData = await watchPromise;
        expect(decryptedData).to.deep.equal([smallClearData]);
      });

      it('throws InvalidArgument when resource was not shared with user', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream();
        encryptor.write(smallClearData);
        encryptor.end();

        const decryptor = await bobLaptop.createDecryptionStream();
        const watchPromise = watchStream(decryptor);

        encryptor.pipe(decryptor);

        await expect(watchPromise).to.be.rejectedWith(errors.InvalidArgument);
      });
    });

    describe('DecryptionStream compatibility', () => {
      it('can decrypt a simple encrypted resource', async () => {
        const protectedData = await aliceLaptop.encryptData(smallClearData, { type: Uint8Array });
        const decryptor = await aliceLaptop.createDecryptionStream();
        const merger = new MergerStream({ type: Uint8Array });

        decryptor.write(protectedData);
        decryptor.end();

        const data = await pipeStreams({ resolveEvent: 'data', streams: [decryptor, merger] });
        expect(data).to.deep.equal(smallClearData);
      });

      it('throws InvalidArgument when the resource is not shared', async () => {
        const protectedData = await aliceLaptop.encryptData(smallClearData, { type: Uint8Array });
        const decryptor = await bobLaptop.createDecryptionStream();
        const merger = new MergerStream({ type: Uint8Array });

        decryptor.write(protectedData);
        decryptor.end();

        await expect(pipeStreams({ resolveEvent: 'data', streams: [decryptor, merger] })).to.be.rejectedWith(errors.InvalidArgument);
      });
    });

    describe('EncryptionStream compatibility', () => {
      const createAliceStreamEncryptedData = async (data: Uint8Array): Promise<Uint8Array> => {
        const encryptor = await aliceLaptop.createEncryptionStream();

        encryptor.write(data);
        encryptor.end();

        const merger = new MergerStream({ type: Uint8Array });
        return pipeStreams<Uint8Array>({ resolveEvent: 'data', streams: [encryptor, merger] });
      };

      it('can encrypt for the decryptData function', async () => {
        const encryptedData = await createAliceStreamEncryptedData(smallClearData);
        const decryptedData = await aliceLaptop.decryptData(encryptedData, { type: Uint8Array });
        expect(decryptedData).to.deep.equal(smallClearData);
      });

      it('can encrypt data for the decrypt function', async () => {
        const str = 'hello';

        const encryptedData = await createAliceStreamEncryptedData(utils.fromString(str));
        const decryptedData = await aliceLaptop.decrypt(encryptedData);
        expect(decryptedData).to.deep.equal(str);
      });
    });
  });
};
