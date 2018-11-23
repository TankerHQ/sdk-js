// @flow
import uuid from 'uuid';
import { errors } from '@tanker/core';
import { utils } from '@tanker/crypto';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateEncryptTests = (args: TestArgs) => {
  describe('resource encryption and sharing', () => {
    const clearText = 'Rosebud';
    let aliceId;
    let bobId;
    let aliceToken;
    let bobToken;

    describe('no session', () => {
      it('throws when using a session in an invalid state', async () => {
        await expect(args.bobLaptop.encrypt(clearText)).to.be.rejectedWith(errors.InvalidSessionStatus);
      });

      it('throws when decrypting using a session in an invalid state', async () => {
        await expect(args.bobLaptop.decrypt(utils.fromString('test'))).to.be.rejectedWith(errors.InvalidSessionStatus);
      });
    });

    describe('encrypt and decrypt', () => {
      before(async () => {
        aliceId = uuid.v4();
        bobId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        bobToken = args.trustchainHelper.generateUserToken(bobId);
        await args.aliceLaptop.open(aliceId, aliceToken);
        await args.bobLaptop.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          args.aliceLaptop.close(),
          args.bobLaptop.close(),
          args.bobPhone.close(),
        ]);
      });

      it('throws when calling encrypt of undefined', async () => {
        // $FlowExpectedError
        await expect(args.bobLaptop.encrypt()).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when shareWithSelf = false and no userId is provided', async () => {
        const promise = args.bobLaptop.encrypt(clearText, { shareWithSelf: false });
        await expect(promise).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting undefined', async () => {
        // $FlowExpectedError
        await expect(args.bobLaptop.decrypt()).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting invalid cipherText', async () => {
        await expect(args.bobLaptop.decrypt(utils.fromString('test'))).to.be.rejectedWith(errors.InvalidEncryptionFormat);
      });

      it('throws when calling decrypt with a corrupted buffer', async () => {
        const cipherText = await args.bobLaptop.encrypt('long message');
        const corruptPos = 7;
        cipherText[corruptPos] = (cipherText[corruptPos] + 1) % 256;
        await expect(args.bobLaptop.decrypt(cipherText)).to.be.rejectedWith(errors.DecryptFailed);
      });

      it('can encrypt and decrypt a text', async () => {
        const cipherText = await args.bobLaptop.encrypt(clearText);
        const decrypted = await args.bobLaptop.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
      });

      describe('share at encryption time', () => {
        it('shares with the recipient', async () => {
          const cipherText = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [aliceId] });
          const decrypted = await args.aliceLaptop.decrypt(cipherText);
          expect(decrypted).to.equal(clearText);
        });

        it('shares even when the recipient is not connected', async () => {
          await args.aliceLaptop.close();
          const cipherText = await args.bobLaptop.encrypt(clearText, { shareWithUsers: [aliceId] });

          await args.aliceLaptop.open(aliceId, aliceToken);
          const decrypted = await args.aliceLaptop.decrypt(cipherText);
          expect(decrypted).to.equal(clearText);
        });

        it('shares with a device created after sharing', async () => {
          const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();

          const cipherText = await args.aliceLaptop.encrypt(clearText, { shareWithUsers: [bobId] });

          // accept device
          args.bobPhone.once('unlockRequired', async () => {
            args.bobPhone.unlockCurrentDevice({ unlockKey: bobUnlockKey });
          });
          await args.bobPhone.open(bobId, bobToken);

          const decrypted = await args.bobPhone.decrypt(cipherText);
          expect(decrypted).to.equal(clearText);
        });

        it('can\'t decrypt if shareWithSelf = false', async () => {
          const cipherText = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [aliceId] });
          await expect(args.bobLaptop.decrypt(cipherText)).to.be.rejectedWith(errors.ResourceNotFound);
          await expect(args.aliceLaptop.decrypt(cipherText)).to.be.fulfilled;
        });

        it('can decrypt if shareWithSelf = false but explicitely shared with self at encryption', async () => {
          const cipherText = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [bobId] });
          await expect(args.bobLaptop.decrypt(cipherText)).to.be.fulfilled;
        });

        describe('deprecated shareWith format', () => {
          it('shares with the recipient', async () => {
            const cipherText = await args.bobLaptop.encrypt(clearText, { shareWith: [aliceId] });
            const decrypted = await args.aliceLaptop.decrypt(cipherText);
            expect(decrypted).to.equal(clearText);
          });
        });
      });
    });

    describe('share after encryption (reshare)', () => {
      before(async () => {
        aliceId = uuid.v4();
        bobId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        bobToken = args.trustchainHelper.generateUserToken(bobId);
        await args.aliceLaptop.open(aliceId, aliceToken);
        await args.bobLaptop.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          args.aliceLaptop.close(),
          args.bobLaptop.close(),
          args.bobPhone.close(),
        ]);
      });

      it('throws when sharing an invalid resource id', async () => {
        // $FlowExpectedError
        await expect(args.bobLaptop.share(null, { shareWithUsers: [aliceId] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with an invalid recipient list', async () => {
        const cipherText = await args.bobLaptop.encrypt(clearText);
        const resourceId = args.bobLaptop.getResourceId(cipherText);
        // $FlowExpectedError
        await expect(args.bobLaptop.share([resourceId])).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing a resource that doesn\'t exist', async () => {
        const badResourceId = 'AAAAAAAAAAAAAAAAAAAA';

        await expect(args.bobLaptop.share([badResourceId], { shareWithUsers: [aliceId] }))
          .to.be.rejectedWith(errors.ResourceNotFound)
          .and.eventually.have.property('b64Mac', badResourceId);
      });

      it('throws when sharing with a user that doesn\'t exist', async () => {
        const edata = await args.bobLaptop.encrypt(clearText);
        const resourceId = args.bobLaptop.getResourceId(edata);
        const eveId = uuid.v4();

        await expect(args.bobLaptop.share([resourceId], { shareWithUsers: [eveId] }))
          .to.be.rejectedWith(errors.RecipientsNotFound)
          .and.eventually.have.property('recipientIds').to.deep.equal([eveId]);
      });

      it('shares an existing resource to an existing user', async () => {
        const cipherText = await args.bobLaptop.encrypt(clearText);
        const resourceId = args.bobLaptop.getResourceId(cipherText);
        await args.bobLaptop.share([resourceId], { shareWithUsers: [aliceId] });

        const decrypted = await args.aliceLaptop.decrypt(cipherText);
        expect(decrypted).to.deep.equal(clearText);
      });

      describe('deprecated shareWith format', () => {
        it('shares an existing resource to an existing user', async () => {
          const cipherText = await args.bobLaptop.encrypt(clearText);
          const resourceId = args.bobLaptop.getResourceId(cipherText);
          await args.bobLaptop.share([resourceId], [aliceId]);

          const decrypted = await args.aliceLaptop.decrypt(cipherText);
          expect(decrypted).to.deep.equal(clearText);
        });
      });
    });

    describe('with multiple devices', () => {
      before(async () => {
        const bobUnlockPassword = 'my password';
        bobId = uuid.v4();
        bobToken = args.trustchainHelper.generateUserToken(bobId);
        await args.bobLaptop.open(bobId, bobToken);
        await args.bobLaptop.registerUnlock({ password: 'my password' });

        args.bobPhone.once('unlockRequired', async () => {
          args.bobPhone.unlockCurrentDevice({ password: bobUnlockPassword });
        });
        await args.bobPhone.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          args.aliceLaptop.close(),
          args.bobLaptop.close(),
          args.bobPhone.close(),
        ]);
      });

      it('can decrypt a text encrypted from another device', async () => {
        const cipherText = await args.bobLaptop.encrypt(clearText);
        const decrypted = await args.bobPhone.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
      });

      it('can\'t decrypt from another device if encrypted with shareWithSelf = false', async () => {
        // create alice so that we can at least share with one recipient
        aliceId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        await args.aliceLaptop.open(aliceId, aliceToken);
        await args.aliceLaptop.close();

        const cipherText = await args.bobLaptop.encrypt(clearText, { shareWithSelf: false, shareWithUsers: [aliceId] });
        await expect(args.bobPhone.decrypt(cipherText)).to.be.rejectedWith(errors.ResourceNotFound);
      });

      it('can access a resource encrypted and shared from a device that was then revoked', async () => {
        const cipherText = await args.bobLaptop.encrypt(clearText);

        // revoke bobLaptop
        await args.bobLaptop.revokeDevice(args.bobLaptop.deviceId);
        await args.bobLaptop.close(); // NOTE: This shouldn't be necessary, but see revocation.spec.js:120 @ da06447e3

        const decrypted = await args.bobPhone.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
      });
    });
  });
};

export default generateEncryptTests;
