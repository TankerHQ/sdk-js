import { errors, Padding } from '@tanker/core';
import type { b64string, Tanker, EncryptionSession, EncryptionStream } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { random, utils, encryptionV4, encryptionV8 } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import type { TestArgs, AppHelper } from './helpers';
import { expectDecrypt, watchStream } from './helpers';

export const generateEncryptionSessionTests = (args: TestArgs) => {
  const clearText: string = 'Rivest Shamir Adleman';

  describe('encrypt resources with encryption sessions', () => {
    let appHelper: AppHelper;
    let aliceLaptop: Tanker;
    let aliceIdentity: b64string;
    let bobLaptop: Tanker;
    let bobPhone: Tanker;
    let bobIdentity: b64string;
    let bobPublicIdentity: b64string;

    before(async () => {
      ({ appHelper } = args);

      aliceIdentity = await appHelper.generateIdentity();
      bobIdentity = await appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);

      aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      bobLaptop = args.makeTanker();
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

      bobPhone = args.makeTanker();
      await bobPhone.start(bobIdentity);
      await bobPhone.verifyIdentity({ passphrase: 'passphrase' });
    });

    after(async () => {
      await Promise.all([
        bobPhone.stop(),
        bobLaptop.stop(),
        aliceLaptop.stop(),
      ]);
    });

    it('throws when using an encryption session with a Tanker instance in an invalid state', async () => {
      // Avoid to stop() a device used in other tests, create a new disposable one:
      const alicePhone = args.makeTanker();
      await alicePhone.start(aliceIdentity);
      await alicePhone.verifyIdentity({ passphrase: 'passphrase' });
      const encryptionSession = await alicePhone.createEncryptionSession();
      await alicePhone.stop();
      await expect(encryptionSession.encrypt(clearText)).to.be.rejectedWith(errors.PreconditionFailed);
    });

    it('decrypts a resource encrypted with an encryption session from another device', async () => {
      const encryptionSession = await bobLaptop.createEncryptionSession();
      const encrypted = await encryptionSession.encrypt(clearText);
      const decrypted = await bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('decrypts a resource shared and encrypted with an encryption session', async () => {
      const encryptionSession = await aliceLaptop.createEncryptionSession({ shareWithUsers: [bobPublicIdentity] });
      const encrypted = await encryptionSession.encrypt(clearText);
      const decrypted = await bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('encrypt and share with a permanent identity and not self', async () => {
      const encryptionSession = await aliceLaptop.createEncryptionSession({ shareWithUsers: [bobPublicIdentity], shareWithSelf: false });
      const encrypted = await encryptionSession.encrypt(clearText);
      await expect(aliceLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      const decrypted = await bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('decrypts a resource postponed shared and encrypted with an encryption session', async () => {
      const encryptionSession = await aliceLaptop.createEncryptionSession();
      const encrypted = await encryptionSession.encrypt(clearText);
      const resourceId = encryptionSession.resourceId;
      await aliceLaptop.share([resourceId], { shareWithUsers: [bobPublicIdentity] });
      const decrypted = await bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('getResourceId returns the same resource id as the encryption session', async () => {
      const encryptionSession = await aliceLaptop.createEncryptionSession();
      const encrypted = await encryptionSession.encrypt(clearText);
      const resourceId = await aliceLaptop.getResourceId(encrypted);
      expect(resourceId).to.equal(encryptionSession.resourceId);
    });

    it('uses a single resource id for multiple resources', async () => {
      const encryptionSession = await aliceLaptop.createEncryptionSession();
      const encrypted1 = await encryptionSession.encrypt(clearText);
      const encrypted2 = await encryptionSession.encrypt(clearText);
      const resourceId1 = await aliceLaptop.getResourceId(encrypted1);
      const resourceId2 = await aliceLaptop.getResourceId(encrypted2);
      expect(resourceId1).to.equal(resourceId2);
    });

    it('uses a distinct resource id per encryption session', async () => {
      const encryptionSession1 = await aliceLaptop.createEncryptionSession();
      const encryptionSession2 = await aliceLaptop.createEncryptionSession();
      expect(encryptionSession1.resourceId).not.to.equal(encryptionSession2.resourceId);
    });

    describe('with the padding option', async () => {
      const encryptSessionOverhead = 57;
      describe('auto', async () => {
        const clearTextAutoPadding = 'my clear data is clear';
        const lengthWithPadme = 22;

        it('encrypts with auto padding by default', async () => {
          const encryptionSession = await aliceLaptop.createEncryptionSession();
          const encrypted = await encryptionSession.encrypt(clearTextAutoPadding);

          expect(encrypted.length - encryptSessionOverhead - 1).to.equal(lengthWithPadme);
          await expectDecrypt([aliceLaptop], clearTextAutoPadding, encrypted);
        });

        it('encrypts and decrypts with auto padding by default', async () => {
          const encryptionSession = await aliceLaptop.createEncryptionSession({ paddingStep: Padding.AUTO });
          const encrypted = await encryptionSession.encrypt(clearTextAutoPadding);

          expect(encrypted.length - encryptSessionOverhead - 1).to.equal(lengthWithPadme);
          await expectDecrypt([aliceLaptop], clearTextAutoPadding, encrypted);
        });
      });

      it('encrypts and decrypts with no padding', async () => {
        const encryptionSession = await aliceLaptop.createEncryptionSession({ paddingStep: Padding.OFF });
        const encrypted = await encryptionSession.encrypt(clearText);

        expect(encrypted.length - encryptSessionOverhead).to.equal(clearText.length);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('encrypts with a paddingStep of 13', async () => {
        const step = 13;
        const encryptionSession = await aliceLaptop.createEncryptionSession({ paddingStep: step });
        const encrypted = await encryptionSession.encrypt(clearText);

        expect((encrypted.length - encryptSessionOverhead - 1) % step).to.equal(0);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('encrypt/decrypt with a huge padding step should select the v8 format', async () => {
        const step = 2 * 1024 * 1024;
        const encryptionSession = await aliceLaptop.createEncryptionSession({ paddingStep: step });
        const encrypted = await encryptionSession.encrypt(clearText);
        expect(encrypted[0]).to.equal(0x08);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      [null, 'invalid string', -42, 0, 1].forEach(step => {
        it(`throws when given ${step} as paddingStep`, async () => {
          // @ts-expect-error
          await expect(aliceLaptop.createEncryptionSession({ paddingStep: step })).to.be.rejectedWith(errors.InvalidArgument);
        });
      });
    });

    describe('using streams', () => {
      let clearData: Uint8Array;
      let encryptedData: Uint8Array;
      let encryptionSession: EncryptionSession;
      let encryptionStream: EncryptionStream;

      before(async () => {
        clearData = new Uint8Array([104, 101, 108, 108, 111]);

        encryptionSession = await aliceLaptop.createEncryptionSession({ shareWithUsers: [bobPublicIdentity] });
        encryptionStream = await encryptionSession.createEncryptionStream();

        const encryptionPromise = new Promise<Array<Uint8Array>>((resolve, reject) => {
          const result: Array<Uint8Array> = [];
          encryptionStream.on('data', data => result.push(data));
          encryptionStream.on('end', () => resolve(result));
          encryptionStream.on('error', reject);
        });

        encryptionStream.write(clearData);
        encryptionStream.end();

        const encryptedParts = await encryptionPromise;
        expect(encryptedParts).to.have.lengthOf(1); // a single 'data' event is expected
        encryptedData = encryptedParts[0]!;
      });

      it('uses the resource id of the session', async () => {
        expect(encryptionStream.resourceId).to.equal(encryptionSession.resourceId);
        await expect(aliceLaptop.getResourceId(encryptedData)).to.eventually.equal(encryptionSession.resourceId);
      });

      it('decrypts a resource encrypted with a stream', async () => {
        const decryptedData = await aliceLaptop.decryptData(encryptedData);
        expect(decryptedData).to.deep.equal(clearData);
      });

      it('decrypts a shared resource encrypted with a stream', async () => {
        const decryptedData = await bobLaptop.decryptData(encryptedData);
        expect(decryptedData).to.deep.equal(clearData);
      });
    });

    describe('padding with streams', () => {
      let clearData: Uint8Array;

      beforeEach(async () => {
        clearData = random(100);
      });

      it('encrypts with auto padding by default', async () => {
        const encryptionSession = await aliceLaptop.createEncryptionSession();
        const encryptor = await encryptionSession.createEncryptionStream();
        encryptor.write(clearData);
        encryptor.end();
        const encrypted = utils.concatArrays(...await watchStream(encryptor));

        expect(encryptionV8.getClearSize(encrypted.length)).to.equal(104);

        const decryptedData = await aliceLaptop.decryptData(encrypted);
        expect(decryptedData).to.deep.equal(clearData);
      });

      it('encrypts with auto padding', async () => {
        const encryptionSession = await aliceLaptop.createEncryptionSession({ paddingStep: Padding.AUTO });
        const encryptor = await encryptionSession.createEncryptionStream();
        encryptor.write(clearData);
        encryptor.end();
        const encrypted = utils.concatArrays(...await watchStream(encryptor));

        expect(encryptionV8.getClearSize(encrypted.length)).to.equal(104);

        const decryptedData = await aliceLaptop.decryptData(encrypted);
        expect(decryptedData).to.deep.equal(clearData);
      });

      it('encrypts and decrypts with no padding', async () => {
        const encryptionSession = await aliceLaptop.createEncryptionSession({ paddingStep: Padding.OFF });
        const encryptor = await encryptionSession.createEncryptionStream();
        encryptor.write(clearData);
        encryptor.end();
        const encrypted = utils.concatArrays(...await watchStream(encryptor));

        expect(encryptionV4.getClearSize(encrypted.length)).to.equal(clearData.length);

        const decryptedData = await aliceLaptop.decryptData(encrypted);
        expect(decryptedData).to.deep.equal(clearData);
      });

      it('encrypts and decrypts with a padding step', async () => {
        const encryptionSession = await aliceLaptop.createEncryptionSession({ paddingStep: 500 });
        const encryptor = await encryptionSession.createEncryptionStream();
        encryptor.write(clearData);
        encryptor.end();
        const encrypted = utils.concatArrays(...await watchStream(encryptor));

        expect(encryptionV8.getClearSize(encrypted.length) % 500).to.equal(0);

        const decryptedData = await aliceLaptop.decryptData(encrypted);
        expect(decryptedData).to.deep.equal(clearData);
      });
    });
  });
};
