// @flow
import uuid from 'uuid';
import { errors } from '@tanker/core';
import { tcrypto, utils } from '@tanker/crypto';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateEncryptTests = (args: TestArgs, resourceType: string) => {
  describe(`${resourceType} resource encryption and sharing`, () => {
    let clear;
    let decryptionMethod;
    let encryptionMethod;
    let aliceId;
    let aliceToken;
    let aliceLaptop;
    let aliceLaptopDecrypt;
    let aliceLaptopEncrypt;
    let bobId;
    let bobToken;
    let bobLaptop;
    let bobLaptopDecrypt;
    let bobLaptopEncrypt;
    let bobPhone;
    let bobPhoneDecrypt;

    before(() => {
      ({ aliceLaptop, bobLaptop, bobPhone } = args);
      ({ clear, decryptionMethod, encryptionMethod } = args.resources[resourceType]);
      // $FlowIKnow
      aliceLaptopDecrypt = aliceLaptop[decryptionMethod].bind(aliceLaptop);
      // $FlowIKnow
      aliceLaptopEncrypt = aliceLaptop[encryptionMethod].bind(aliceLaptop);
      // $FlowIKnow
      bobLaptopDecrypt = bobLaptop[decryptionMethod].bind(bobLaptop);
      // $FlowIKnow
      bobLaptopEncrypt = bobLaptop[encryptionMethod].bind(bobLaptop);
      // $FlowIKnow
      bobPhoneDecrypt = bobPhone[decryptionMethod].bind(bobPhone);
    });

    describe('no session', () => {
      it('throws when using a session in an invalid state', async () => {
        await expect(bobLaptopEncrypt(clear)).to.be.rejectedWith(errors.InvalidSessionStatus);
      });

      it('throws when decrypting using a session in an invalid state', async () => {
        await expect(bobLaptopDecrypt(utils.fromString('test'))).to.be.rejectedWith(errors.InvalidSessionStatus);
      });
    });

    describe(`encrypt and decrypt a ${resourceType} resource`, () => {
      before(async () => {
        aliceId = uuid.v4();
        bobId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        bobToken = args.trustchainHelper.generateUserToken(bobId);
        await aliceLaptop.open(aliceId, aliceToken);
        await bobLaptop.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          aliceLaptop.close(),
          bobLaptop.close(),
          bobPhone.close(),
        ]);
      });

      it('throws when calling encrypt of undefined', async () => {
        await expect(bobLaptopEncrypt()).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when shareWithSelf = false and no userId is provided', async () => {
        const promise = bobLaptopEncrypt(clear, { shareWithSelf: false });
        await expect(promise).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting an invalid type', async () => {
        const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'str'];
        for (let i = 0; i < notUint8ArrayTypes.length; i++) {
          await expect(bobLaptopDecrypt(notUint8ArrayTypes[i]), `bad decryption #${i}`).to.be.rejectedWith(errors.InvalidArgument);
        }
      });

      it('throws when decrypting data with an unknow encryption format', async () => {
        const invalidEncrypted = new Uint8Array([127]);
        await expect(bobLaptopDecrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidEncryptionFormat);
      });

      it('throws when decrypting data with an invalid encryption format', async () => {
        const invalidEncrypted = new Uint8Array([255]); // not a varint
        await expect(bobLaptopDecrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidEncryptionFormat);
      });

      it('throws when decrypting truncated encrypted resource', async () => {
        const encrypted = await bobLaptopEncrypt(clear);
        // shorter than version + resource ID: should not even try to decrypt
        const invalidEncrypted = encrypted.subarray(0, tcrypto.MAC_SIZE - 4);
        const exceptionType = resourceType === 'big binary' ? errors.NotEnoughData : errors.InvalidArgument;
        await expect(bobLaptopDecrypt(invalidEncrypted)).to.be.rejectedWith(exceptionType);
      });

      it('throws when calling decrypt with a corrupted buffer', async () => {
        const encrypted = await bobLaptopEncrypt(clear);
        const corruptPos = encrypted.length - 4;
        encrypted[corruptPos] = (encrypted[corruptPos] + 1) % 256;
        // Depending of where the corruption occurs, one of these exceptions is thrown:
        const exceptionTypes = [errors.DecryptFailed, errors.ResourceNotFound];
        await expect(bobLaptopDecrypt(encrypted)).to.be.rejectedWith(exceptionTypes);
      });

      it(`can encrypt and decrypt a ${resourceType} resource`, async () => {
        const encrypted = await bobLaptopEncrypt(clear);
        const decrypted = await bobLaptopDecrypt(encrypted);
        expect(decrypted).to.deep.equal(clear);
      });

      describe('share at encryption time', () => {
        it('shares with the recipient', async () => {
          const encrypted = await bobLaptopEncrypt(clear, { shareWithUsers: [aliceId] });
          const decrypted = await aliceLaptopDecrypt(encrypted);
          expect(decrypted).to.deep.equal(clear);
        });

        it('shares even when the recipient is not connected', async () => {
          await aliceLaptop.close();
          const encrypted = await bobLaptopEncrypt(clear, { shareWithUsers: [aliceId] });

          await aliceLaptop.open(aliceId, aliceToken);
          const decrypted = await aliceLaptopDecrypt(encrypted);
          expect(decrypted).to.deep.equal(clear);
        });

        it('shares with a device created after sharing', async () => {
          const bobUnlockKey = await bobLaptop.generateAndRegisterUnlockKey();

          const encrypted = await aliceLaptopEncrypt(clear, { shareWithUsers: [bobId] });

          // accept device
          bobPhone.once('unlockRequired', async () => {
            bobPhone.unlockCurrentDevice({ unlockKey: bobUnlockKey });
          });
          await bobPhone.open(bobId, bobToken);

          const decrypted = await bobPhoneDecrypt(encrypted);
          expect(decrypted).to.deep.equal(clear);
        });

        it('can\'t decrypt if shareWithSelf = false', async () => {
          const encrypted = await bobLaptopEncrypt(clear, { shareWithSelf: false, shareWithUsers: [aliceId] });
          await expect(bobLaptopDecrypt(encrypted)).to.be.rejectedWith(errors.ResourceNotFound);
          await expect(aliceLaptopDecrypt(encrypted)).to.be.fulfilled;
        });

        it('can decrypt if shareWithSelf = false but explicitely shared with self at encryption', async () => {
          const encrypted = await bobLaptopEncrypt(clear, { shareWithSelf: false, shareWithUsers: [bobId] });
          await expect(bobLaptopDecrypt(encrypted)).to.be.fulfilled;
        });

        describe('deprecated shareWith format', () => {
          it('shares with the recipient', async () => {
            const encrypted = await bobLaptopEncrypt(clear, { shareWith: [aliceId] });
            const decrypted = await aliceLaptopDecrypt(encrypted);
            expect(decrypted).to.deep.equal(clear);
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
        await aliceLaptop.open(aliceId, aliceToken);
        await bobLaptop.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          aliceLaptop.close(),
          bobLaptop.close(),
          bobPhone.close(),
        ]);
      });

      it('throws when sharing an invalid resource id', async () => {
        // $FlowExpectedError
        await expect(bobLaptop.share(null, { shareWithUsers: [aliceId] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with an invalid recipient list', async () => {
        const encrypted = await bobLaptopEncrypt(clear);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        // $FlowExpectedError
        await expect(bobLaptop.share([resourceId])).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing a resource that doesn\'t exist', async () => {
        const badResourceId = 'AAAAAAAAAAAAAAAAAAAA';

        await expect(bobLaptop.share([badResourceId], { shareWithUsers: [aliceId] }))
          .to.be.rejectedWith(errors.ResourceNotFound)
          .and.eventually.have.property('b64Mac', badResourceId);
      });

      it('throws when sharing with a user that doesn\'t exist', async () => {
        const edata = await bobLaptopEncrypt(clear);
        const resourceId = await bobLaptop.getResourceId(edata);
        const eveId = uuid.v4();

        await expect(bobLaptop.share([resourceId], { shareWithUsers: [eveId] }))
          .to.be.rejectedWith(errors.RecipientsNotFound)
          .and.eventually.have.property('recipientIds').to.deep.equal([eveId]);
      });

      it('shares an existing resource to an existing user', async () => {
        const encrypted = await bobLaptopEncrypt(clear);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        await bobLaptop.share([resourceId], { shareWithUsers: [aliceId] });

        const decrypted = await aliceLaptopDecrypt(encrypted);
        expect(decrypted).to.deep.equal(clear);
      });

      describe('deprecated shareWith format', () => {
        it('shares an existing resource to an existing user', async () => {
          const encrypted = await bobLaptopEncrypt(clear);
          const resourceId = await bobLaptop.getResourceId(encrypted);
          await bobLaptop.share([resourceId], [aliceId]);

          const decrypted = await aliceLaptopDecrypt(encrypted);
          expect(decrypted).to.deep.equal(clear);
        });
      });
    });

    describe('with multiple devices', () => {
      before(async () => {
        const bobUnlockPassword = 'my password';
        bobId = uuid.v4();
        bobToken = args.trustchainHelper.generateUserToken(bobId);
        await bobLaptop.open(bobId, bobToken);
        await bobLaptop.registerUnlock({ password: 'my password' });

        bobPhone.once('unlockRequired', async () => {
          bobPhone.unlockCurrentDevice({ password: bobUnlockPassword });
        });
        await bobPhone.open(bobId, bobToken);
      });

      after(async () => {
        await Promise.all([
          aliceLaptop.close(),
          bobLaptop.close(),
          bobPhone.close(),
        ]);
      });

      it('can decrypt a resource encrypted from another device', async () => {
        const encrypted = await bobLaptopEncrypt(clear);
        const decrypted = await bobPhoneDecrypt(encrypted);
        expect(decrypted).to.deep.equal(clear);
      });

      it('can\'t decrypt from another device if encrypted with shareWithSelf = false', async () => {
        // create alice so that we can at least share with one recipient
        aliceId = uuid.v4();
        aliceToken = args.trustchainHelper.generateUserToken(aliceId);
        await aliceLaptop.open(aliceId, aliceToken);
        await aliceLaptop.close();

        const encrypted = await bobLaptopEncrypt(clear, { shareWithSelf: false, shareWithUsers: [aliceId] });
        await expect(bobPhoneDecrypt(encrypted)).to.be.rejectedWith(errors.ResourceNotFound);
      });

      it('can access a resource encrypted and shared from a device that was then revoked', async () => {
        const encrypted = await bobLaptopEncrypt(clear);

        // revoke bobLaptop
        await bobLaptop.revokeDevice(bobLaptop.deviceId);
        await bobLaptop.close(); // NOTE: This shouldn't be necessary, but see revocation.spec.js:120 @ da06447e3

        const decrypted = await bobPhoneDecrypt(encrypted);
        expect(decrypted).to.deep.equal(clear);
      });
    });
  });
};

export default generateEncryptTests;
