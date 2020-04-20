// @flow
import { errors } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import type { TestArgs } from './helpers';

const generateEncryptionSessionTests = (args: TestArgs) => {
  const clearText: string = 'Rivest Shamir Adleman';

  describe('encrypt resources with encryption sessions', () => {
    let appHelper;
    let aliceLaptop;
    let aliceIdentity;
    let bobLaptop;
    let bobPhone;
    let bobIdentity;
    let bobPublicIdentity;

    before(() => {
      ({ appHelper } = args);
    });

    beforeEach(async () => {
      aliceIdentity = await appHelper.generateIdentity();
      bobIdentity = await appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      aliceLaptop = args.makeTanker();
      bobLaptop = args.makeTanker();
      bobPhone = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobPhone.start(bobIdentity);
      await bobPhone.verifyIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await Promise.all([
        bobPhone.stop(),
        bobLaptop.stop(),
        aliceLaptop.stop(),
      ]);
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

    it('throws when using an encryption session with a Tanker in an invalid state', async () => {
      const encryptionSession = await aliceLaptop.createEncryptionSession();
      await aliceLaptop.stop();
      await expect(encryptionSession.encrypt(clearText)).to.be.rejectedWith(errors.PreconditionFailed);
    });
  });
};

export default generateEncryptionSessionTests;
