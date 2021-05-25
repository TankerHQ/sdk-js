// @flow
import { errors, statuses } from '@tanker/core';
import { encryptionV4, tcrypto, utils } from '@tanker/crypto';
import { getConstructorName, getDataLength } from '@tanker/types';
import { createProvisionalIdentity, getPublicIdentity } from '@tanker/identity';
import { expect, sinon, uuid } from '@tanker/test-utils';

import type { TestArgs } from './helpers';
import { expectProgressReport, expectType, expectSameType, expectDeepEqual } from './helpers';

const { READY, IDENTITY_VERIFICATION_NEEDED } = statuses;

export const generateEncryptionTests = (args: TestArgs) => {
  const clearText: string = 'Rivest Shamir Adleman';

  describe('text resource encryption and sharing - no session', () => {
    let bobLaptop;

    before(() => { bobLaptop = args.makeTanker(); });

    it('throws when using a session in an invalid state', async () => {
      await expect(bobLaptop.encrypt(clearText)).to.be.rejectedWith(errors.PreconditionFailed);
    });

    it('throws when decrypting using a session in an invalid state', async () => {
      await expect(bobLaptop.decrypt(utils.fromString('test'))).to.be.rejectedWith(errors.PreconditionFailed);
    });
  });

  describe('text resource encryption and sharing', () => {
    let aliceLaptop;
    let aliceIdentity;
    let alicePublicIdentity;
    let bobLaptop;
    let bobIdentity;
    let bobPublicIdentity;
    let appHelper;

    before(async () => {
      ({ appHelper } = args);
      aliceIdentity = await appHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      bobIdentity = await appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      aliceLaptop = args.makeTanker();
      bobLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
      ]);
    });

    describe('encrypt and decrypt a text resource', () => {
      it('throws when calling encrypt of undefined', async () => {
        // $FlowExpectedError Testing invalid argument
        await expect(bobLaptop.encrypt()).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting an invalid type', async () => {
        const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'str'];
        for (let i = 0; i < notUint8ArrayTypes.length; i++) {
          // $FlowExpectedError Testing invalid types
          await expect(bobLaptop.decrypt(notUint8ArrayTypes[i]), `bad decryption #${i}`).to.be.rejectedWith(errors.InvalidArgument);
        }
      });

      it('throws when decrypting data with an unknow encryption format', async () => {
        const invalidEncrypted = new Uint8Array([127]);
        await expect(bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting data with an invalid encryption format', async () => {
        const invalidEncrypted = new Uint8Array([255]); // not a varint
        await expect(bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting truncated encrypted resource', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        // shorter than version + resource id: should not even try to decrypt
        const invalidEncrypted = encrypted.subarray(0, tcrypto.MAC_SIZE - 4);
        await expect(bobLaptop.decrypt(invalidEncrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when calling decrypt with a corrupted buffer (resource id)', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const corruptPos = encrypted.length - 4;
        encrypted[corruptPos] = (encrypted[corruptPos] + 1) % 256;
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when calling decrypt with a corrupted buffer (data)', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const corruptPos = 4;
        encrypted[corruptPos] = (encrypted[corruptPos] + 1) % 256;
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.DecryptionFailed);
      });

      it('can encrypt and decrypt a text resource', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const decrypted = await bobLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('can report progress when encrypting and decrypting', async () => {
        const onProgress = sinon.fake();

        const encrypted = await bobLaptop.encrypt(clearText, { onProgress });
        expectProgressReport(onProgress, encrypted.length);
        onProgress.resetHistory();

        const decrypted = await bobLaptop.decrypt(encrypted, { onProgress });
        expectProgressReport(onProgress, decrypted.length, encryptionV4.defaultMaxEncryptedChunkSize - encryptionV4.overhead);
      });

      it('encrypt should ignore resource id argument', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);

        const encrypted2 = await bobLaptop.encrypt(clearText, (({ resourceId }): any));
        const resourceId2 = await bobLaptop.getResourceId(encrypted2);
        expect(resourceId2).to.not.equal(resourceId);
      });
    });

    describe('share at encryption time', () => {
      it('encrypt and share with a permanent identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });
        const decrypted = await aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('encrypt and share with a permanent identity and not self', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity], shareWithSelf: false });
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
        const decrypted = await aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('fails to encrypt and not share with anybody', async () => {
        await expect(bobLaptop.encrypt(clearText, { shareWithSelf: false })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('encrypt and share with a provisional identity', async () => {
        const email = 'alice.test@tanker.io';
        const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(appHelper.appId), email);
        const publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] })).to.be.fulfilled;
      });

      it('throws when trying to share with more than 100 recipients', async () => {
        const identities = new Array(101).fill(alicePublicIdentity);

        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: identities })).to.be.rejectedWith(errors.InvalidArgument);

        const encryptedData = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encryptedData);
        await expect(bobLaptop.share([resourceId], { shareWithUsers: identities })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with secret permanent identities', async () => {
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [aliceIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with secret provisional identities', async () => {
        const email = 'alice.test@tanker.io';
        const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(appHelper.appId), email);
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [provisionalIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with a permanent identity that is not registered', async () => {
        const evePublicIdentity = await getPublicIdentity(await appHelper.generateIdentity('eve'));
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [evePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, evePublicIdentity);
      });

      it('shares even when the recipient is not connected', async () => {
        await aliceLaptop.stop();
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });

        await aliceLaptop.start(aliceIdentity);
        const decrypted = await aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('shares with a device created after sharing', async () => {
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithUsers: [bobPublicIdentity] });
        const bobPhone = args.makeTanker();
        await bobPhone.start(bobIdentity);
        await bobPhone.verifyIdentity({ passphrase: 'passphrase' });
        const decrypted = await bobPhone.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
        await bobPhone.stop();
      });
    });

    describe('share after encryption (reshare)', () => {
      it('throws when sharing an invalid resource id', async () => {
        // $FlowExpectedError
        await expect(bobLaptop.share(null, { shareWithUsers: [alicePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with an invalid recipient list', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        // $FlowExpectedError
        await expect(bobLaptop.share([resourceId])).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing a resource that doesn\'t exist', async () => {
        const badResourceId = 'AAAAAAAAAAAAAAAAAAAAAA==';
        await expect(bobLaptop.share([badResourceId], { shareWithUsers: [alicePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, badResourceId);
      });

      it('throws when sharing with a permanent identity that is not registered', async () => {
        const edata = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(edata);
        const evePublicIdentity = await getPublicIdentity(await appHelper.generateIdentity('eve'));

        await expect(bobLaptop.share([resourceId], { shareWithUsers: [evePublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, evePublicIdentity);
      });

      it('shares an existing resource with a permanent identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        await bobLaptop.share([resourceId], { shareWithUsers: [alicePublicIdentity] });

        const decrypted = await aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('shares the same resourceId twice', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        await bobLaptop.share([resourceId, resourceId], { shareWithUsers: [alicePublicIdentity] });

        const decrypted = await aliceLaptop.decrypt(encrypted);
        expect(decrypted).to.equal(clearText);
      });

      it('shares an existing resource with a provisional identity', async () => {
        const email = 'alice.test@tanker.io';
        const provisionalIdentity = await createProvisionalIdentity(utils.toBase64(appHelper.appId), email);
        const publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);
        const cipherText = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(cipherText);
        await expect(bobLaptop.share([resourceId], { shareWithUsers: [publicProvisionalIdentity] })).to.be.fulfilled;
      });
    });

    describe('decrypt resources shared with provisional identities', () => {
      let email;
      let provisionalIdentity;
      let publicProvisionalIdentity;

      beforeEach(async () => {
        email = `${uuid.v4()}@tanker.io`;
        provisionalIdentity = await createProvisionalIdentity(utils.toBase64(appHelper.appId), email);
        publicProvisionalIdentity = await getPublicIdentity(provisionalIdentity);

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        expect(attachResult).to.deep.equal({
          status: IDENTITY_VERIFICATION_NEEDED,
          verificationMethod: { type: 'email', email },
        });
      });

      it('does not throw if nothing to claim', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.fulfilled;
      });

      it('throws if claiming a provisional identity already attached by someone else', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.rejectedWith(errors.PreconditionFailed);
      });

      it('throws if claiming an already attached provisional', async () => {
        const aliceVerificationCode = await appHelper.getEmailVerificationCode(email);
        await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode: aliceVerificationCode })).to.be.fulfilled;

        const attachResult = await bobLaptop.attachProvisionalIdentity(provisionalIdentity);
        expect(attachResult).to.deep.equal({
          status: IDENTITY_VERIFICATION_NEEDED,
          verificationMethod: { type: 'email', email },
        });
        const bobVerificationCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyProvisionalIdentity({ email, verificationCode: bobVerificationCode })).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('does not throw if nothing to claim and same email registered as verification method', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await aliceLaptop.setVerificationMethod({ email, verificationCode });

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        expect(attachResult).to.deep.equal({ status: READY });
      });

      it('decrypt data shared with an attached provisional identity', async () => {
        const cipherText = await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        const decrypted = await aliceLaptop.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
      });

      it('decrypt data shared with an attached provisional identity after session restart', async () => {
        const cipherText = await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });
        await aliceLaptop.stop();

        await aliceLaptop.start(aliceIdentity);
        const decrypted = await aliceLaptop.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
      });

      it('throws when sharing with already claimed identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] })).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('gracefully accept an already attached provisional identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisionalIdentity);
        expect(attachResult).to.deep.equal({ status: READY });
      });

      it('attach a provisional identity without requesting verification if email already verified', async () => {
        const cipherText = await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const eveIdentity = await appHelper.generateIdentity();
        const eveLaptop = args.makeTanker();

        const verificationCode = await appHelper.getEmailVerificationCode(email);

        await eveLaptop.start(eveIdentity);
        await eveLaptop.registerIdentity({ email, verificationCode });

        const attachResult = await eveLaptop.attachProvisionalIdentity(provisionalIdentity);
        expect(attachResult).to.deep.equal({ status: READY });

        const decrypted = await eveLaptop.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
        await eveLaptop.stop();
      });

      it('throws when verifying provisional identity with wrong verification code', async () => {
        await expect(aliceLaptop.verifyProvisionalIdentity({ email, verificationCode: 'wrongCode' })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('throws when verifying an email that does not match the provisional identity', async () => {
        const anotherEmail = `${uuid.v4()}@tanker.io`;
        const verificationCode = await appHelper.getEmailVerificationCode(anotherEmail);
        await expect(aliceLaptop.verifyProvisionalIdentity({ email: anotherEmail, verificationCode })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throw when two users attach the same provisional identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.attachProvisionalIdentity(provisionalIdentity);
        await expect(bobLaptop.verifyProvisionalIdentity({ email, verificationCode })).to.be.rejectedWith(errors.IdentityAlreadyAttached, 'one or more provisional identities are already attached');
      });

      it('can attach a provisional identity after a revocation', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const bobPhone = args.makeTanker();
        await bobPhone.start(bobIdentity);
        await bobPhone.verifyIdentity({ passphrase: 'passphrase' });

        const deviceID = bobPhone.deviceId;
        await bobPhone.revokeDevice(deviceID);

        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.attachProvisionalIdentity(provisionalIdentity);
        await bobLaptop.verifyProvisionalIdentity({ email, verificationCode });
        await bobPhone.stop();
      });

      it('decrypt resource on a new device', async () => {
        const cipherText = await bobLaptop.encrypt(clearText, { shareWithUsers: [publicProvisionalIdentity] });

        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await aliceLaptop.verifyProvisionalIdentity({ email, verificationCode });

        const alicePhone = args.makeTanker();
        await alicePhone.start(aliceIdentity);
        await alicePhone.verifyIdentity({ passphrase: 'passphrase' });
        const decrypted = await alicePhone.decrypt(cipherText);
        expect(decrypted).to.equal(clearText);
        await alicePhone.stop();
      });
    });
  });

  describe('text resource encryption and sharing with multiple devices', () => {
    let appHelper;
    let aliceLaptop;
    let aliceIdentity;
    let bobLaptop;
    let bobPhone;
    let bobIdentity;

    before(() => {
      ({ appHelper } = args);
    });

    beforeEach(async () => {
      aliceIdentity = await appHelper.generateIdentity();
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

    afterEach(async () => {
      await Promise.all([
        bobPhone.stop(),
        bobLaptop.stop(),
        aliceLaptop.stop(),
      ]);
    });

    it('can decrypt a resource encrypted from another device', async () => {
      const encrypted = await bobLaptop.encrypt(clearText);
      const decrypted = await bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('can access a resource encrypted and shared from a device that was then revoked', async () => {
      const encrypted = await bobLaptop.encrypt(clearText);

      // revoke bobLaptop
      await bobPhone.revokeDevice(bobLaptop.deviceId);

      const decrypted = await bobPhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });
  });

  // Some sizes may not be tested on some platforms (e.g. 'big' on Safari)
  const forEachSize = (sizes: Array<string>, fun: (size: string) => void) => {
    const availableSizes = Object.keys(args.resources);
    return sizes.filter(size => availableSizes.includes(size)).forEach(fun);
  };

  describe('binary resource encryption', () => {
    let aliceLaptop;
    let aliceIdentity;

    before(async () => {
      aliceIdentity = await args.appHelper.generateIdentity();
      aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    after(async () => {
      await aliceLaptop.stop();
    });

    forEachSize(['empty', 'small', 'medium', 'big'], size => {
      args.resources[size].forEach(({ type, resource: clear }) => {
        it(`can encrypt and decrypt a ${size} ${getConstructorName(type)}`, async () => {
          const onProgress = sinon.fake();

          const encrypted = await aliceLaptop.encryptData(clear, { onProgress });
          expectSameType(encrypted, clear);
          expectProgressReport(onProgress, getDataLength(encrypted));
          onProgress.resetHistory();

          const decrypted = await aliceLaptop.decryptData(encrypted, { onProgress });
          expectSameType(decrypted, clear);
          expectDeepEqual(decrypted, clear);
          expectProgressReport(onProgress, getDataLength(decrypted), encryptionV4.defaultMaxEncryptedChunkSize - encryptionV4.overhead);
        });
      });
    });

    // Medium and big resources use the same encryption format, so no need to test on big resources
    forEachSize(['small', 'medium'], size => {
      args.resources[size].forEach(({ type: originalType, resource: clear }) => {
        args.resources[size].forEach(({ type: transientType }) => {
          it(`can encrypt a ${size} ${getConstructorName(originalType)} into a ${getConstructorName(transientType)} and decrypt back a ${getConstructorName(originalType)}`, async () => {
            const encrypted = await aliceLaptop.encryptData(clear, { type: transientType });
            expectType(encrypted, transientType);

            const outputOptions = {};
            outputOptions.type = originalType;

            if (global.Blob && outputOptions.type === Blob) {
              outputOptions.mime = clear.type;
            }
            if (global.File && outputOptions.type === File) {
              outputOptions.mime = clear.type;
              outputOptions.name = clear.name;
              outputOptions.lastModified = clear.lastModified;
            }

            const decrypted = await aliceLaptop.decryptData(encrypted, outputOptions);
            expectType(decrypted, originalType);

            expectDeepEqual(decrypted, clear);
          });
        });
      });
    });
  });
};
