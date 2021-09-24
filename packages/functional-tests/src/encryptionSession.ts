import { errors } from '@tanker/core';
import type { b64string, Tanker, EncryptionSession, EncryptionStream } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import type { TestArgs, AppHelper } from './helpers';

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
      const encrypted = await encryptionSession.encrypt<Uint8Array>(clearText);
      const resourceId = await aliceLaptop.getResourceId(encrypted);
      expect(resourceId).to.equal(encryptionSession.resourceId);
    });

    it('uses a single resource id for multiple resources', async () => {
      const encryptionSession = await aliceLaptop.createEncryptionSession();
      const encrypted1 = await encryptionSession.encrypt<Uint8Array>(clearText);
      const encrypted2 = await encryptionSession.encrypt<Uint8Array>(clearText);
      const resourceId1 = await aliceLaptop.getResourceId(encrypted1);
      const resourceId2 = await aliceLaptop.getResourceId(encrypted2);
      expect(resourceId1).to.equal(resourceId2);
    });

    it('uses a distinct resource id per encryption session', async () => {
      const encryptionSession1 = await aliceLaptop.createEncryptionSession();
      const encryptionSession2 = await aliceLaptop.createEncryptionSession();
      expect(encryptionSession1.resourceId).not.to.equal(encryptionSession2.resourceId);
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
  });
};
