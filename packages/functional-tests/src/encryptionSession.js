// @flow
import { errors } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import type { TestArgs } from './helpers';

export const generateEncryptionSessionTests = (args: TestArgs) => {
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

    it('throws when using an encryption session with a Tanker instance in an invalid state', async () => {
      const encryptionSession = await aliceLaptop.createEncryptionSession();
      await aliceLaptop.stop();
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
      const resourceId2 = await aliceLaptop.getResourceId(encrypted1);
      expect(resourceId1).to.equal(resourceId2);
    });

    it('uses a distinct resource id per encryption session', async () => {
      const encryptionSession1 = await aliceLaptop.createEncryptionSession();
      const encryptionSession2 = await aliceLaptop.createEncryptionSession();
      expect(encryptionSession1.resourceId).not.to.equal(encryptionSession2.resourceId);
    });
  });
};
