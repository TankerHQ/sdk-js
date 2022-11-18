import { errors, statuses } from '@tanker/core';
import type { Tanker, b64string, OutputOptions } from '@tanker/core';
import { EncryptionV4, EncryptionV6, EncryptionV9, EncryptionV11, tcrypto, unserializeCompositeResourceId, utils, Padding, padme, generichash } from '@tanker/crypto';
import { Data, getConstructorName, getDataLength } from '@tanker/types';
import { getPublicIdentity, createProvisionalIdentity } from '@tanker/identity';
import { expect, sinon, uuid } from '@tanker/test-utils';

import { MergerStream } from '@tanker/stream-base/';
import { TestArgs, AppHelper, AppProvisionalUser, TestResourceSize, pipeStreams, expectProgressReport, expectType, expectSameType, expectDeepEqual, expectDecrypt } from './helpers';

const { READY } = statuses;

const streamStepSize = EncryptionV4.defaultMaxEncryptedChunkSize - EncryptionV4.overhead;

export const generateEncryptionTests = (args: TestArgs) => {
  const clearText: string = 'Rivest Shamir Adleman';

  describe('text resource encryption and sharing - no session', () => {
    let bobLaptop: Tanker;

    before(() => { bobLaptop = args.makeTanker(); });

    it('throws when using a session in an invalid state', async () => {
      await expect(bobLaptop.encrypt(clearText)).to.be.rejectedWith(errors.PreconditionFailed);
    });

    it('throws when decrypting using a session in an invalid state', async () => {
      await expect(bobLaptop.decrypt(utils.fromString('test'))).to.be.rejectedWith(errors.PreconditionFailed);
    });
  });

  describe('text resource encryption and sharing', () => {
    let aliceLaptop: Tanker;
    let aliceIdentity: b64string;
    let alicePublicIdentity: b64string;
    let bobLaptop: Tanker;
    let bobIdentity: b64string;
    let bobPublicIdentity: b64string;
    let charlieLaptop: Tanker;
    let charlieIdentity: b64string;
    let charliePublicIdentity: b64string;
    let appHelper: AppHelper;

    before(async () => {
      ({ appHelper } = args);
      aliceIdentity = await appHelper.generateIdentity();
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      bobIdentity = await appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      charlieIdentity = await appHelper.generateIdentity();
      charliePublicIdentity = await getPublicIdentity(charlieIdentity);
      aliceLaptop = args.makeTanker();
      bobLaptop = args.makeTanker();
      charlieLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await charlieLaptop.start(charlieIdentity);
      await charlieLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    after(async () => {
      await Promise.all([
        aliceLaptop.stop(),
        bobLaptop.stop(),
        charlieLaptop.stop(),
      ]);
    });

    describe('encrypt and decrypt a text resource', () => {
      it('throws when calling encrypt of undefined', async () => {
        // @ts-expect-error Testing invalid argument
        await expect(bobLaptop.encrypt()).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when decrypting an invalid type', async () => {
        const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'str'];
        for (let i = 0; i < notUint8ArrayTypes.length; i++) {
          // @ts-expect-error Testing invalid types
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
        encrypted[corruptPos] = (encrypted[corruptPos]! + 1) % 256;
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when calling decrypt with a corrupted buffer (data)', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const corruptPos = 4;
        encrypted[corruptPos] = (encrypted[corruptPos]! + 1) % 256;
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.DecryptionFailed);
      });

      it('can encrypt and decrypt a text resource', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        await expectDecrypt([bobLaptop], clearText, encrypted);
      });

      describe('with padding', () => {
        const simpleEncryptionOverhead = 17;
        const paddedSimpleEncryptionOverhead = simpleEncryptionOverhead + 1;

        describe('auto', () => {
          const clearTextAutoPadding = 'my clear data is clear!';
          const lengthWithPadme = 24;

          it('encrypts with auto padding by default', async () => {
            const encrypted = await bobLaptop.encrypt(clearTextAutoPadding);
            expect(encrypted.length - paddedSimpleEncryptionOverhead).to.equal(lengthWithPadme);
            await expectDecrypt([bobLaptop], clearTextAutoPadding, encrypted);
          });

          it('encrypts and decrypts with auto padding', async () => {
            const encrypted = await bobLaptop.encrypt(clearTextAutoPadding, { paddingStep: Padding.AUTO });
            expect(encrypted.length - paddedSimpleEncryptionOverhead).to.equal(lengthWithPadme);
            await expectDecrypt([bobLaptop], clearTextAutoPadding, encrypted);
          });
        });

        it('encrypts and decrypts with no padding', async () => {
          const encrypted = await bobLaptop.encrypt(clearText, { paddingStep: Padding.OFF });
          expect(encrypted.length - simpleEncryptionOverhead).to.equal(clearText.length);
          await expectDecrypt([bobLaptop], clearText, encrypted);
        });

        it('encrypts and decrypts with a padding step', async () => {
          const step = 13;
          const encrypted = await bobLaptop.encrypt(clearText, { paddingStep: step });
          expect((encrypted.length - paddedSimpleEncryptionOverhead) % step).to.equal(0);
          await expectDecrypt([bobLaptop], clearText, encrypted);
        });

        it('encrypt/decrypt with a huge padding step should select the v8 format', async () => {
          const step = 2 * 1024 * 1024;
          const encrypted = await bobLaptop.encrypt(clearText, { paddingStep: step });
          expect(encrypted[0]).to.equal(0x08);
          await expectDecrypt([bobLaptop], clearText, encrypted);
        });

        [null, 'invalid string', -42, 0, 1].forEach(step => {
          it(`throws when given a paddingStep set to ${step}`, async () => {
            // @ts-expect-error
            await expect(bobLaptop.encrypt(clearText, { paddingStep: step })).to.be.rejectedWith(errors.InvalidArgument);
          });
        });
      });

      it('can report progress when encrypting and decrypting', async () => {
        const onProgress = sinon.fake();

        const encrypted = await bobLaptop.encrypt(clearText, { onProgress });
        expectProgressReport(onProgress, encrypted.length);
        onProgress.resetHistory();

        const decrypted = await bobLaptop.decrypt(encrypted, { onProgress });
        expectProgressReport(onProgress, padme(decrypted.length), streamStepSize);
      });

      it('encrypt should ignore resource id argument', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);

        const encrypted2 = await bobLaptop.encrypt(clearText, ({ resourceId } as any));
        const resourceId2 = await bobLaptop.getResourceId(encrypted2);
        expect(resourceId2).to.not.equal(resourceId);
      });
    });

    describe('share at encryption time', () => {
      it('encrypts and shares with a permanent identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('encrypts and shares with two permanent identities', async () => {
        const encrypted = await charlieLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity, bobPublicIdentity] });
        await expectDecrypt([aliceLaptop, bobLaptop], clearText, encrypted);
      });

      it('dedupes identities when encrypting/sharing with the same permanent identity twice', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity, alicePublicIdentity] });
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('encrypts and shares with a permanent identity and not self', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity], shareWithSelf: false });
        await expect(bobLaptop.decrypt(encrypted)).to.be.rejectedWith(errors.InvalidArgument);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('fails to encrypt and not share with anybody', async () => {
        await expect(bobLaptop.encrypt(clearText, { shareWithSelf: false })).to.be.rejectedWith(errors.InvalidArgument, 'not share with anybody');
      });

      it('throws when trying to share with more than 100 recipients', async () => {
        const identities = new Array(101).fill(alicePublicIdentity);

        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: identities })).to.be.rejectedWith(errors.InvalidArgument, 'more than 100 recipients');

        const encryptedData = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encryptedData);
        await expect(bobLaptop.share([resourceId], { shareWithUsers: identities })).to.be.rejectedWith(errors.InvalidArgument, 'more than 100 recipients');
      });

      it('throws when sharing with secret identities', async () => {
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [aliceIdentity] })).to.be.rejectedWith(errors.InvalidArgument, 'unexpected secret identity');

        const provisional = await appHelper.generateEmailProvisionalIdentity();
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.identity] })).to.be.rejectedWith(errors.InvalidArgument, 'unexpected secret identity');
      });

      it('throws when sharing with a permanent identity that is not registered', async () => {
        const evePublicIdentity = await getPublicIdentity(await appHelper.generateIdentity('eve'));
        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [evePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument, evePublicIdentity);
      });

      it('shares even when the recipient is not connected', async () => {
        await aliceLaptop.stop();
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity] });

        await aliceLaptop.start(aliceIdentity);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('shares with a device created after sharing', async () => {
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithUsers: [bobPublicIdentity] });
        const bobPhone = args.makeTanker();
        await bobPhone.start(bobIdentity);
        await bobPhone.verifyIdentity({ passphrase: 'passphrase' });
        await expectDecrypt([bobPhone], clearText, encrypted);
        await bobPhone.stop();
      });

      it('shares and manually pads the data at the same time', async () => {
        const step = 13;
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [alicePublicIdentity], paddingStep: step });

        const paddedSize = encrypted.length - EncryptionV6.overhead;
        expect(paddedSize % step).to.equal(0);

        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });
    });

    describe('share after encryption (reshare)', () => {
      it('throws when sharing an invalid resource id', async () => {
        // @ts-expect-error
        await expect(bobLaptop.share(null, { shareWithUsers: [alicePublicIdentity] })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throws when sharing with an invalid recipient list', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        // @ts-expect-error
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

      it('throws when sharing with a provisional identity from another trustchain', async () => {
        const otherTrustchain = {
          id: 'gOhJDFYKK/GNScGOoaZ1vLAwxkuqZCY36IwEo4jcnDE=',
          sk: 'D9jiQt7nB2IlRjilNwUVVTPsYkfbCX0PelMzx5AAXIaVokZ71iUduWCvJ9Akzojca6lvV8u1rnDVEdh7yO6JAQ==',
        };

        const invalidProvisionalIdentity = await createProvisionalIdentity(otherTrustchain.id, 'email', 'doe@john.com');
        const invalidPublicIdentity = await getPublicIdentity(invalidProvisionalIdentity);

        const edata = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(edata);

        await expect(bobLaptop.share([resourceId], { shareWithUsers: [invalidPublicIdentity] }))
          .to.be.rejectedWith(errors.InvalidArgument, 'Invalid appId for identities');
      });

      it('is a noop to share an empty resource array', async () => {
        await expect(bobLaptop.share([], { shareWithUsers: [alicePublicIdentity] })).to.be.fulfilled;
      });

      it('shares an existing resource with a permanent identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        await bobLaptop.share([resourceId], { shareWithUsers: [alicePublicIdentity] });

        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('shares a not-cached resource with a permanent identity', async () => {
        const encrypted = await aliceLaptop.encrypt(clearText);
        const resourceId = await aliceLaptop.getResourceId(encrypted);
        await aliceLaptop.share([resourceId], { shareWithUsers: [bobPublicIdentity] });
        await bobLaptop.share([resourceId], { shareWithUsers: [charliePublicIdentity] });

        await expectDecrypt([charlieLaptop], clearText, encrypted);
      });

      it('shares multiple resources with multiple permanent identities', async () => {
        const encrypted = await aliceLaptop.encrypt(clearText);
        const resourceId = await aliceLaptop.getResourceId(encrypted);
        const encrypted2 = await aliceLaptop.encrypt(clearText);
        const resourceId2 = await aliceLaptop.getResourceId(encrypted2);
        await aliceLaptop.share([resourceId, resourceId2], { shareWithUsers: [bobPublicIdentity, charliePublicIdentity] });

        await expectDecrypt([bobLaptop, charlieLaptop], clearText, encrypted);
        await expectDecrypt([bobLaptop, charlieLaptop], clearText, encrypted2);
      });

      it('shares the same resourceId twice', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        await bobLaptop.share([resourceId, resourceId], { shareWithUsers: [alicePublicIdentity] });

        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });
    });

    describe('decrypt resources shared with email (+phone) provisional identities', () => {
      let provisional: AppProvisionalUser;
      let provisional2: AppProvisionalUser;

      beforeEach(async () => {
        provisional = await appHelper.generateEmailProvisionalIdentity();
        provisional2 = await appHelper.generatePhoneNumberProvisionalIdentity();
      });

      it('does not throw if nothing to claim', async () => {
        await expect(appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional)).to.be.fulfilled;
      });

      it('throws if verifying a provisional identity before attaching it', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(provisional.value);
        await expect(bobLaptop.verifyProvisionalIdentity({ email: provisional.value, verificationCode })).to.be.rejectedWith(errors.PreconditionFailed, 'without having called attachProvisionalIdentity');
      });

      it('throws if claiming an already attached provisional', async () => {
        await appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional);

        await expect(appHelper.attachVerifyEmailProvisionalIdentity(bobLaptop, provisional)).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('does not throw if nothing to claim and same email registered as verification method', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(provisional.value);
        await aliceLaptop.setVerificationMethod({ email: provisional.value, verificationCode });

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        expect(attachResult).to.deep.equal({ status: READY });
      });

      it('decrypts data encrypted-and-shared with an attached provisional identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional);

        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('decrypts data shared with two attached provisional identities', async () => {
        const encrypted = await aliceLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity, provisional2.publicIdentity] });

        await appHelper.attachVerifyEmailProvisionalIdentity(bobLaptop, provisional);
        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(charlieLaptop, provisional2);

        await expectDecrypt([bobLaptop, charlieLaptop], clearText, encrypted);
      });

      it('shares an existing resource with an email provisional identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        await expect(bobLaptop.share([resourceId], { shareWithUsers: [provisional.publicIdentity] })).to.be.fulfilled;

        await appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('shares an existing resource with a phone number provisional identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText);
        const resourceId = await bobLaptop.getResourceId(encrypted);
        await expect(bobLaptop.share([resourceId], { shareWithUsers: [provisional2.publicIdentity] })).to.be.fulfilled;

        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(aliceLaptop, provisional2);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('shares an existing resource with two provisional identities', async () => {
        const encrypted = await aliceLaptop.encrypt(clearText);
        const resourceId = await aliceLaptop.getResourceId(encrypted);
        await expect(aliceLaptop.share([resourceId], { shareWithUsers: [provisional.publicIdentity, provisional2.publicIdentity] })).to.be.fulfilled;

        await appHelper.attachVerifyEmailProvisionalIdentity(bobLaptop, provisional);
        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(charlieLaptop, provisional2);

        await expectDecrypt([bobLaptop, charlieLaptop], clearText, encrypted);
      });

      it('decrypt data shared with an attached provisional identity after session restart', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional);
        await aliceLaptop.stop();

        await aliceLaptop.start(aliceIdentity);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('throws when sharing with already claimed identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional);

        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] })).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('gracefully accept an already attached provisional identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional);

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        expect(attachResult).to.deep.equal({ status: READY });
      });

      it('attach without another verification if email already verified and claimed', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(provisional.value);
        await aliceLaptop.setVerificationMethod({ email: provisional.value, verificationCode });

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        expect(attachResult).to.deep.equal({ status: READY });
      });

      it('throws when verifying provisional identity with wrong verification code', async () => {
        await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        await expect(aliceLaptop.verifyProvisionalIdentity({ email: provisional.value, verificationCode: 'wrongCode' })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('throws when verifying an email that does not match the provisional identity', async () => {
        await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        const anotherEmail = `${uuid.v4()}@tanker.io`;
        const verificationCode = await appHelper.getEmailVerificationCode(anotherEmail);
        await expect(aliceLaptop.verifyProvisionalIdentity({ email: anotherEmail, verificationCode })).to.be.rejectedWith(errors.InvalidArgument, 'does not match provisional identity');
      });

      it('throws when two users attach the same provisional identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional);
        await expect(appHelper.attachVerifyEmailProvisionalIdentity(bobLaptop, provisional)).to.be.rejectedWith(errors.IdentityAlreadyAttached, 'one or more provisional identities are already attached');
      });

      it('decrypt resource on a new device', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyEmailProvisionalIdentity(aliceLaptop, provisional);

        const alicePhone = args.makeTanker();
        await alicePhone.start(aliceIdentity);
        await alicePhone.verifyIdentity({ passphrase: 'passphrase' });
        await expectDecrypt([alicePhone], clearText, encrypted);
        await alicePhone.stop();
      });
    });

    describe('decrypt resources shared with phone_number provisional identities', () => {
      let provisional: AppProvisionalUser;

      beforeEach(async () => {
        provisional = await appHelper.generatePhoneNumberProvisionalIdentity();
      });

      it('throws if claiming an already attached provisional', async () => {
        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(aliceLaptop, provisional);

        await expect(appHelper.attachVerifyPhoneNumberProvisionalIdentity(bobLaptop, provisional)).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('decrypts data encrypted-and-shared with an attached provisional identity', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(aliceLaptop, provisional);

        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('decrypt data shared with an attached provisional identity after session restart', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(aliceLaptop, provisional);
        await aliceLaptop.stop();

        await aliceLaptop.start(aliceIdentity);
        await expectDecrypt([aliceLaptop], clearText, encrypted);
      });

      it('throws when sharing with already claimed identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(aliceLaptop, provisional);

        await expect(bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] })).to.be.rejectedWith(errors.IdentityAlreadyAttached);
      });

      it('gracefully accept an already attached provisional identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(aliceLaptop, provisional);

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        expect(attachResult).to.deep.equal({ status: READY });
      });

      it('attach without another verification if phone number already verified and claimed', async () => {
        const verificationCode = await appHelper.getSMSVerificationCode(provisional.value);
        await aliceLaptop.setVerificationMethod({ phoneNumber: provisional.value, verificationCode });

        const attachResult = await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        expect(attachResult).to.deep.equal({ status: READY });
      });

      it('throws when verifying provisional identity with wrong verification code', async () => {
        await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        await expect(aliceLaptop.verifyProvisionalIdentity({ phoneNumber: provisional.value, verificationCode: 'wrongCode' })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('throws when verifying a phone number that does not match the provisional identity', async () => {
        await aliceLaptop.attachProvisionalIdentity(provisional.identity);
        const anotherPhone = (await appHelper.generatePhoneNumberProvisionalIdentity()).value;
        const verificationCode = await appHelper.getSMSVerificationCode(anotherPhone);
        await expect(aliceLaptop.verifyProvisionalIdentity({ phoneNumber: anotherPhone, verificationCode })).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('throw when two users attach the same provisional identity', async () => {
        await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(aliceLaptop, provisional);
        await expect(appHelper.attachVerifyPhoneNumberProvisionalIdentity(bobLaptop, provisional)).to.be.rejectedWith(errors.IdentityAlreadyAttached, 'one or more provisional identities are already attached');
      });

      it('decrypt resource on a new device', async () => {
        const encrypted = await bobLaptop.encrypt(clearText, { shareWithUsers: [provisional.publicIdentity] });

        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(aliceLaptop, provisional);

        const alicePhone = args.makeTanker();
        await alicePhone.start(aliceIdentity);
        await alicePhone.verifyIdentity({ passphrase: 'passphrase' });
        await expectDecrypt([alicePhone], clearText, encrypted);
        await alicePhone.stop();
      });
    });
  });

  describe('text resource encryption and sharing with multiple devices', () => {
    let appHelper: AppHelper;
    let bobLaptop: Tanker;
    let bobPhone: Tanker;
    let bobIdentity: b64string;

    before(() => {
      ({ appHelper } = args);
    });

    beforeEach(async () => {
      bobIdentity = await appHelper.generateIdentity();
      bobLaptop = args.makeTanker();
      bobPhone = args.makeTanker();

      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobPhone.start(bobIdentity);
      await bobPhone.verifyIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await Promise.all([
        bobPhone.stop(),
        bobLaptop.stop(),
      ]);
    });

    it('can decrypt a resource encrypted from another device', async () => {
      const encrypted = await bobLaptop.encrypt(clearText);
      await expectDecrypt([bobPhone], clearText, encrypted);
    });
  });

  // Some sizes may not be tested on some platforms (e.g. 'big' on Safari)
  const forEachSize = (sizes: Array<TestResourceSize>, fun: (size: TestResourceSize) => void) => {
    const availableSizes = Object.keys(args.resources);
    return sizes.filter(size => availableSizes.includes(size)).forEach(fun);
  };

  describe('binary resource encryption', () => {
    let aliceLaptop: Tanker;
    let aliceIdentity: b64string;

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
      args.resources[size]!.forEach(({ type, resource: clear }) => {
        it(`can encrypt and decrypt a ${size} ${getConstructorName(type)}`, async () => {
          const onProgress = sinon.fake();

          // We disable padding for this test because we need to test the
          // progress report precisely. This test tests only progress reports,
          // padding does not influence that (except the fact that the numbers
          // are a little off because they become unpredictable).
          const encrypted = await aliceLaptop.encryptData(clear, { paddingStep: Padding.OFF, onProgress });
          expectSameType(encrypted, clear);
          expectProgressReport(onProgress, getDataLength(encrypted));
          onProgress.resetHistory();

          const decrypted = await aliceLaptop.decryptData(encrypted, { onProgress });
          expectSameType(decrypted, clear);
          expectDeepEqual(decrypted, clear);
          expectProgressReport(onProgress, getDataLength(decrypted), streamStepSize);
        });
      });
    });

    // Medium and big resources use the same encryption format, so no need to test on big resources
    forEachSize(['small', 'medium'], size => {
      args.resources[size]!.forEach(({ type: originalType, resource: clear }) => {
        args.resources[size]!.forEach(({ type: transientType }) => {
          it(`can encrypt a ${size} ${getConstructorName(originalType)} into a ${getConstructorName(transientType)} and decrypt back a ${getConstructorName(originalType)}`, async () => {
            const encrypted = await aliceLaptop.encryptData(clear, { type: transientType });
            expectType(encrypted, transientType);

            const outputOptions: Partial<OutputOptions<Data>> = {};
            outputOptions.type = originalType;

            if (global.Blob && outputOptions.type === Blob) {
              outputOptions.mime = (clear as Blob).type;
            }
            if (global.File && outputOptions.type === File) {
              const file = clear as File;
              outputOptions.mime = file.type;
              outputOptions.name = file.name;
              outputOptions.lastModified = file.lastModified;
            }

            const decrypted = await aliceLaptop.decryptData(encrypted, outputOptions);
            expectType(decrypted, originalType);

            expectDeepEqual(decrypted, clear);
          });
        });
      });
    });
  });

  describe('Transparent session forward compatibility', () => {
    let appHelper: AppHelper;
    let aliceLaptop: Tanker;
    let aliceIdentity: b64string;
    let alicePublicIdentity: b64string;
    let bobLaptop: Tanker;
    let bobIdentity: b64string;
    let bobPublicIdentity: b64string;

    type TestVector = {
      key: Uint8Array;
      clearData: string;
      encryptedData: Uint8Array;
      resourceId: Uint8Array;
    };
    const testVectorV9: TestVector = {
      key: new Uint8Array([
        0x18, 0x89, 0xa4, 0xb6, 0x66, 0x0c, 0x14, 0x4e, 0x3a, 0xef, 0x29,
        0x46, 0xcb, 0x6e, 0x10, 0xf3, 0x26, 0xf5, 0xf9, 0x48, 0x4c, 0x99,
        0x95, 0x49, 0x96, 0x7f, 0x48, 0xb0, 0xcc, 0x68, 0xe5, 0xa3,
      ]),
      clearData: 'this is very secret',
      encryptedData: new Uint8Array([
        0x09, 0x66, 0xf3, 0x4d, 0x6b, 0x50, 0x98, 0x52, 0x38, 0x9d, 0x3e, 0x55,
        0x53, 0xf2, 0xbe, 0x22, 0x6c, 0x95, 0x06, 0x59, 0x02, 0x9c, 0x53, 0x4f,
        0xec, 0x23, 0x40, 0x60, 0x77, 0x20, 0xee, 0x07, 0x5c, 0x6f, 0x51, 0xcf,
        0x88, 0xe5, 0x00, 0xaa, 0x3a, 0x90, 0x08, 0x8e, 0x4b, 0x22, 0x93, 0xbc,
        0x24, 0x02, 0x62, 0x89, 0x79, 0x51, 0x95, 0x8e, 0x2b, 0x03, 0xcd, 0xcf,
        0xc6, 0x23, 0x90, 0xb4, 0xe3, 0x94, 0xe5, 0x98,
      ]),
      resourceId: new Uint8Array([
        0x00, 0x66, 0xf3, 0x4d, 0x6b, 0x50, 0x98, 0x52, 0x38, 0x9d, 0x3e,
        0x55, 0x53, 0xf2, 0xbe, 0x22, 0x6c, 0x95, 0x06, 0x59, 0x02, 0x9c,
        0x53, 0x4f, 0xec, 0x23, 0x40, 0x60, 0x77, 0x20, 0xee, 0x07, 0x5c,
      ]),
    };

    const testVectorV11: TestVector = {
      key: new Uint8Array([
        0xbc, 0xb7, 0xc3, 0x08, 0x92, 0x01, 0xf9, 0x05, 0x15, 0x52, 0x1c,
        0x05, 0xdc, 0xe2, 0x99, 0x60, 0xa4, 0x61, 0xa3, 0x77, 0x0d, 0x2c,
        0x37, 0xf0, 0xed, 0x3e, 0xb1, 0x23, 0x41, 0x40, 0x76, 0x64,
      ]),
      clearData: 'this is very secret',
      encryptedData: new Uint8Array([
        0x0b, 0xa3, 0xe6, 0x5d, 0x0e, 0xcc, 0x6f, 0x7e, 0xd4, 0xb2, 0xc7,
        0x7e, 0xa0, 0x87, 0xa6, 0xde, 0x7c, 0xca, 0xbe, 0x4a, 0x9b, 0xa1,
        0x3d, 0xfc, 0x93, 0x62, 0xf8, 0x49, 0x11, 0xb1, 0x09, 0x69, 0xae,
        0x1e, 0x00, 0x00, 0x00, 0x75, 0xbe, 0xe5, 0x08, 0x83, 0x61, 0xcb,
        0xc5, 0xa0, 0xf9, 0xa6, 0x9d, 0x13, 0x52, 0xb0, 0x63, 0x61, 0x20,
        0x85, 0xf7, 0xa8, 0x0e, 0xf8, 0x96, 0xd0, 0x73, 0xa6, 0xf6, 0x8c,
        0x30, 0x3c, 0xed, 0x7b, 0xd5, 0x47, 0xe6, 0xf2, 0xb3, 0x7e, 0xa8,
        0x69, 0x75, 0x7e, 0xe7, 0xa4, 0xde, 0x40, 0xc5, 0x2e, 0xdc, 0xc9,
        0x4d, 0x32, 0x71, 0x32, 0x93, 0x68, 0x71, 0x19,
      ]),
      resourceId: new Uint8Array([
        0x00, 0xa3, 0xe6, 0x5d, 0x0e, 0xcc, 0x6f, 0x7e, 0xd4, 0xb2, 0xc7,
        0x7e, 0xa0, 0x87, 0xa6, 0xde, 0x7c, 0xca, 0xbe, 0x4a, 0x9b, 0xa1,
        0x3d, 0xfc, 0x93, 0x62, 0xf8, 0x49, 0x11, 0xb1, 0x09, 0x69, 0xae,
      ]),
    };

    beforeEach(async () => {
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

    const generateForwardCompatTests = (encryptor: typeof EncryptionV9 | typeof EncryptionV11, testVector: TestVector) => {
      it('decrypts cypher text', async () => {
        // eslint-disable-next-line no-underscore-dangle
        bobLaptop._session!._resourceManager.findKeyFromResourceId = sinon.fake(() => testVector.key);
        expect(await bobLaptop.decrypt(testVector.encryptedData)).to.equal(testVector.clearData);
      });

      it('decrypts with a DecryptionStream', async () => {
        // eslint-disable-next-line no-underscore-dangle
        bobLaptop._session!._resourceManager.findKeyFromResourceId = sinon.fake(() => testVector.key);

        const decryptor = await bobLaptop.createDecryptionStream();
        const merger = new MergerStream({ type: Uint8Array });

        decryptor.write(testVector.encryptedData);
        decryptor.end();

        const data = await pipeStreams({ resolveEvent: 'data', streams: [decryptor, merger] });
        expect(data).to.deep.equal(utils.fromString(testVector.clearData));
      });

      it('shares composite resourceID from session key', async () => {
        const fakeBob = sinon.fake(() => testVector.key);
        // eslint-disable-next-line no-underscore-dangle
        bobLaptop._session!._resourceManager.findKeyFromResourceId = fakeBob;

        // eslint-disable-next-line no-underscore-dangle
        const fake = sinon.fake(aliceLaptop._session!._resourceManager._findKeysFromResourceIds);
        // eslint-disable-next-line no-underscore-dangle
        aliceLaptop._session!._resourceManager._findKeysFromResourceIds = fake;

        await bobLaptop.share([utils.toBase64(testVector.resourceId)], { shareWithUsers: [alicePublicIdentity] });
        expect(await aliceLaptop.decrypt(testVector.encryptedData)).to.equal(testVector.clearData);

        // called during share
        expect(fakeBob.callCount).to.equal(1);

        // called during decrypt
        expect(fake.callCount).to.equal(2);
        expect(fake.firstCall.returnValue).to.be.rejectedWith(errors.InvalidArgument);
      });

      it('shares composite resourceID from individual resource key', async () => {
        const data = encryptor.extractResourceId(testVector.encryptedData);
        const compositeId = unserializeCompositeResourceId(data);
        const resourceKey = generichash(utils.concatArrays(testVector.key, compositeId.resourceId));

        const fakeBob = sinon.fake((id: Uint8Array) => {
          if (utils.equalArray(id, compositeId.resourceId))
            return resourceKey;
          throw new Error('use the individual resource key instead');
        });
        // eslint-disable-next-line no-underscore-dangle
        bobLaptop._session!._resourceManager.findKeyFromResourceId = fakeBob;

        // eslint-disable-next-line no-underscore-dangle
        const fake = sinon.fake(aliceLaptop._session!._resourceManager._findKeysFromResourceIds);
        // eslint-disable-next-line no-underscore-dangle
        aliceLaptop._session!._resourceManager._findKeysFromResourceIds = fake;

        // share from session key
        await bobLaptop.share([utils.toBase64(testVector.resourceId)], { shareWithUsers: [alicePublicIdentity] });
        // share from individual resoutceId
        await aliceLaptop.share([utils.toBase64(testVector.resourceId)], { shareWithUsers: [bobPublicIdentity] });
        expect(await aliceLaptop.decrypt(testVector.encryptedData)).to.equal(testVector.clearData);

        // called during share
        expect(fakeBob.args).to.deep.equal([[compositeId.sessionId], [compositeId.resourceId]]);

        // called during share and decrypt
        expect(fake.callCount).to.equal(4);
        expect(fake.firstCall.returnValue).to.be.rejectedWith(errors.InvalidArgument);
      });
    };

    describe('V9', () => {
      generateForwardCompatTests(EncryptionV9, testVectorV9);
    });

    describe('V11', () => {
      generateForwardCompatTests(EncryptionV11, testVectorV11);
    });
  });
};
