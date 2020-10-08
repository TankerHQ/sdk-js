// @flow
import { errors } from '@tanker/core';
import { expect } from '@tanker/test-utils';
import { getPublicIdentity } from '@tanker/identity';
import type { TestArgs } from './helpers';

export const generateResourceKeyDeletionTests = (args: TestArgs) => {
  const clearText: string = 'Rivest Shamir Adleman';

  describe('resource keys deletion', () => {
    let aliceLaptop;
    let aliceIdentity;
    let alicePublicIdentity;
    let bobLaptop;
    let bobPhone;
    let bobIdentity;
    let appHelper;

    before(async () => {
      ({ appHelper } = args);
      aliceIdentity = await appHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      bobIdentity = await appHelper.generateIdentity();
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

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobPhone.stop(),
        bobLaptop.stop(),
      ]);
    });

    it('throws when decrypting an encrypted text shared with another user, and resource key is deleted', async () => {
      const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });
      const resourceId = await bobLaptop.getResourceId(encrypted);

      await appHelper.deleteResourceKeys([resourceId]);

      await expect(aliceLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws when decrypting an encrypted text with another device of the same user, and resource key is deleted', async () => {
      const encrypted = await bobLaptop.encrypt(clearText);
      const resourceId = await bobLaptop.getResourceId(encrypted);

      await appHelper.deleteResourceKeys([resourceId]);

      await expect(bobPhone.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
    });
  });
};
