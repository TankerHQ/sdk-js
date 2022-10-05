import { errors, Padding } from '@tanker/core';
import type { Tanker } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { utils, EncryptionV4, EncryptionV8 } from '@tanker/crypto';
import type { b64string } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';
import { MergerStream } from '@tanker/stream-base';

import type { TestArgs } from './helpers';
import { pipeStreams, watchStream } from './helpers';

const fiveMiB = 5 * 1024 * 1024;

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

      largeClearData = new Uint8Array(fiveMiB);
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

    describe('padding with streams', () => {
      let almost5MiBBuffer: Uint8Array;
      before(() => {
        almost5MiBBuffer = largeClearData.subarray(0, fiveMiB - 30);
      });

      it('encrypts with auto padding by default', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream();
        encryptor.write(almost5MiBBuffer);
        encryptor.end();
        const encrypted = utils.concatArrays(...await watchStream(encryptor));

        // padme rounds to 5MiB in this case
        expect(EncryptionV8.getClearSize(encrypted.length)).to.equal(fiveMiB);

        const decryptor = await aliceLaptop.createDecryptionStream();
        decryptor.write(encrypted);
        decryptor.end();
        const decryptedData = utils.concatArrays(...await watchStream(decryptor));

        expect(decryptedData).to.deep.equal(almost5MiBBuffer);
      });

      it('encrypts with auto padding', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream({ paddingStep: Padding.AUTO });
        encryptor.write(almost5MiBBuffer);
        encryptor.end();
        const encrypted = utils.concatArrays(...await watchStream(encryptor));

        // padme rounds to 5MiB in this case
        expect(EncryptionV8.getClearSize(encrypted.length)).to.equal(fiveMiB);

        const decryptor = await aliceLaptop.createDecryptionStream();
        decryptor.write(encrypted);
        decryptor.end();
        const decryptedData = utils.concatArrays(...await watchStream(decryptor));

        expect(decryptedData).to.deep.equal(almost5MiBBuffer);
      });

      it('encrypts and decrypts with no padding', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream({ paddingStep: Padding.OFF });
        encryptor.write(almost5MiBBuffer);
        encryptor.end();
        const encrypted = utils.concatArrays(...await watchStream(encryptor));

        expect(EncryptionV4.getClearSize(encrypted.length)).to.equal(almost5MiBBuffer.length);

        const decryptor = await aliceLaptop.createDecryptionStream();
        decryptor.write(encrypted);
        decryptor.end();
        const decryptedData = utils.concatArrays(...await watchStream(decryptor));

        expect(decryptedData).to.deep.equal(almost5MiBBuffer);
      });

      it('encrypts and decrypts with a padding step', async () => {
        const encryptor = await aliceLaptop.createEncryptionStream({ paddingStep: 500 });
        encryptor.write(almost5MiBBuffer);
        encryptor.end();
        const encrypted = utils.concatArrays(...await watchStream(encryptor));

        expect(EncryptionV8.getClearSize(encrypted.length) % 500).to.equal(0);

        const decryptor = await aliceLaptop.createDecryptionStream();
        decryptor.write(encrypted);
        decryptor.end();
        const decryptedData = utils.concatArrays(...await watchStream(decryptor));

        expect(decryptedData).to.deep.equal(almost5MiBBuffer);
      });

      [null, 'invalid string', -42, 0, 1].forEach(step => {
        it(`throws when given a paddingStep set to ${step}`, async () => {
          // @ts-expect-error
          await expect(aliceLaptop.createEncryptionStream({ paddingStep: step })).to.be.rejectedWith(errors.InvalidArgument);
        });
      });
    });

    describe('padding with simple encrypts and large buffers', () => {
      let almost5MiBBuffer: Uint8Array;
      before(() => {
        almost5MiBBuffer = largeClearData.subarray(0, fiveMiB - 30);
      });

      it('encrypts with auto padding by default', async () => {
        const encrypted = await aliceLaptop.encryptData(almost5MiBBuffer);
        // padme rounds to 5MiB in this case
        expect(EncryptionV8.getClearSize(encrypted.length)).to.equal(fiveMiB);
        const decryptedData = await aliceLaptop.decryptData(encrypted);
        expect(decryptedData).to.deep.equal(almost5MiBBuffer);
      });

      it('encrypts with auto padding by default', async () => {
        const encrypted = await aliceLaptop.encryptData(almost5MiBBuffer, { paddingStep: Padding.AUTO });
        // padme rounds to 5MiB in this case
        expect(EncryptionV8.getClearSize(encrypted.length)).to.equal(fiveMiB);
        const decryptedData = await aliceLaptop.decryptData(encrypted);
        expect(decryptedData).to.deep.equal(almost5MiBBuffer);
      });

      it('encrypts and decrypts with no padding', async () => {
        const encrypted = await aliceLaptop.encryptData(almost5MiBBuffer, { paddingStep: Padding.OFF });
        expect(EncryptionV4.getClearSize(encrypted.length)).to.equal(almost5MiBBuffer.length);
        const decryptedData = await aliceLaptop.decryptData(encrypted);
        expect(decryptedData).to.deep.equal(almost5MiBBuffer);
      });

      it('encrypts and decrypts with a padding step', async () => {
        const encrypted = await aliceLaptop.encryptData(almost5MiBBuffer, { paddingStep: 500 });
        expect(EncryptionV8.getClearSize(encrypted.length) % 500).to.equal(0);
        const decryptedData = await aliceLaptop.decryptData(encrypted);
        expect(decryptedData).to.deep.equal(almost5MiBBuffer);
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

    [{}, { paddingStep: Padding.OFF }].forEach((options) => describe('EncryptionStream compatibility', () => {
      const createAliceStreamEncryptedData = async (data: Uint8Array): Promise<Uint8Array> => {
        const encryptor = await aliceLaptop.createEncryptionStream(options);

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
    }));
  });
};
