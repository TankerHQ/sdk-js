/* eslint-disable @typescript-eslint/no-unused-expressions */
import { errors, statuses } from '@tanker/core';
import type { Tanker, b64string, Verification, VerificationMethod, LegacyEmailVerificationMethod } from '@tanker/core';
import { utils } from '@tanker/crypto';
import { fetch } from '@tanker/http-utils';
import { expect, uuid } from '@tanker/test-utils';

import type { AppHelper, TestArgs } from './helpers';
import { trustchaindUrl } from './helpers';

const { READY, IDENTITY_VERIFICATION_NEEDED, IDENTITY_REGISTRATION_NEEDED } = statuses;

const verificationThrottlingAttempts = 3;

const expectVerificationToMatchMethod = (verification: Verification, method: VerificationMethod | LegacyEmailVerificationMethod) => {
  // @ts-expect-error email might not be defined
  const { type, email, phoneNumber } = method;
  expect(type in verification).to.be.true;

  if (type === 'email') {
    // @ts-expect-error I tested the 'email' type already
    expect(email).to.equal(verification.email);
    expect(phoneNumber).to.be.undefined;
    // @ts-expect-error I tested the 'email' type
    expect(verification.phoneNumber).to.be.undefined;
  } else if (type === 'phoneNumber') {
    // @ts-expect-error I tested the 'phoneNumber' type already
    expect(phoneNumber).to.equal(verification.phoneNumber);
    expect(email).to.be.undefined;
    // @ts-expect-error I tested the 'phoneNumber' type already
    expect(verification.email).to.be.undefined;
  }
};

const expectVerification = async (tanker: Tanker, identity: string, verification: Verification) => {
  await tanker.start(identity);
  expect(tanker.status).to.equal(IDENTITY_VERIFICATION_NEEDED);

  // Remember for later testing
  const [method, ...otherMethods] = await tanker.getVerificationMethods();

  await tanker.verifyIdentity(verification);
  expect(tanker.status).to.equal(READY);

  // Test after verifyIdentity() to allow tests on unregistered verification types
  expect(otherMethods).to.be.an('array').that.is.empty;
  expectVerificationToMatchMethod(verification, method!);
};

export const generateVerificationTests = (args: TestArgs) => {
  describe('verification', () => {
    let bobLaptop: Tanker;
    let bobPhone: Tanker;
    let bobIdentity: b64string;
    let appHelper: AppHelper;

    before(() => {
      ({ appHelper } = args);
    });

    beforeEach(async () => {
      const bobId = uuid.v4();
      bobIdentity = await appHelper.generateIdentity(bobId);
      bobLaptop = args.makeTanker();
      bobPhone = args.makeTanker();
      await bobLaptop.start(bobIdentity);
    });

    afterEach(async () => {
      await Promise.all([
        bobLaptop.stop(),
        bobPhone.stop(),
      ]);
    });

    describe('verification method administration', () => {
      it('needs registration after start', async () => {
        expect(bobLaptop.status).to.equal(IDENTITY_REGISTRATION_NEEDED);
      });

      it('can test that passphrase verification method has been registered', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'passphrase' }]);
      });

      it('can test that email verification method has been registered', async () => {
        const email = await appHelper.generateRandomEmail();
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'email', email }]);
      });

      it('can test that phone number verification method has been registered', async () => {
        const phoneNumber = await appHelper.generateRandomPhoneNumber();
        const verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'phoneNumber', phoneNumber }]);
      });

      it('should fail to register an email verification method if the verification code is wrong', async () => {
        const email = await appHelper.generateRandomEmail();
        const verificationCode = await appHelper.getWrongEmailVerificationCode(email);
        await expect(bobLaptop.registerIdentity({ email, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('should fail to register a phone number verification method if the verification code is wrong', async () => {
        const phoneNumber = await appHelper.generateRandomPhoneNumber();
        const verificationCode = await appHelper.getWrongSMSVerificationCode(phoneNumber);
        await expect(bobLaptop.registerIdentity({ phoneNumber, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('should fail to register an email verification method if the verification code is not for the targeted email', async () => {
        const email = await appHelper.generateRandomEmail();
        const otherEmail = await appHelper.generateRandomEmail();
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.registerIdentity({ email: otherEmail, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('should fail to register a phone number verification method if the verification code is not for the targeted phone number', async () => {
        const phoneNumber = await appHelper.generateRandomPhoneNumber();
        const otherPhoneNumber = await appHelper.generateRandomPhoneNumber();
        const verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await expect(bobLaptop.registerIdentity({ phoneNumber: otherPhoneNumber, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('can test that every verification methods have been registered', async () => {
        const email = await appHelper.generateRandomEmail();
        const phoneNumber = await appHelper.generateRandomPhoneNumber();
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        await bobLaptop.setVerificationMethod({ passphrase: 'passphrase' });

        const smsVerificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.setVerificationMethod({ phoneNumber, verificationCode: smsVerificationCode });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([
          { type: 'email', email },
          { type: 'passphrase' },
          { type: 'phoneNumber', phoneNumber },
        ]);
      });

      it('can test that email verification method has been updated and use it', async () => {
        let email = await appHelper.generateRandomEmail();
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        // update email
        email = await appHelper.generateRandomEmail();
        verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.setVerificationMethod({ email, verificationCode });

        // check email is updated in cache
        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'email', email }]);

        // check email can be used on new device
        await bobPhone.start(bobIdentity);
        verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobPhone.verifyIdentity({ email, verificationCode });

        // check received email is the updated one on new device
        expect(await bobPhone.getVerificationMethods()).to.have.deep.members([{ type: 'email', email }]);
      });

      it('can test that phone number verification method has been updated and use it', async () => {
        let phoneNumber = await appHelper.generateRandomPhoneNumber();
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        // update phone number
        phoneNumber = await appHelper.generateRandomPhoneNumber();
        verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.setVerificationMethod({ phoneNumber, verificationCode });

        // check phone number is updated in cache
        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'phoneNumber', phoneNumber }]);

        // check phone number can be used on new device
        await bobPhone.start(bobIdentity);
        verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobPhone.verifyIdentity({ phoneNumber, verificationCode });

        // check received phone number is the updated one on new device
        expect(await bobPhone.getVerificationMethods()).to.have.deep.members([{ type: 'phoneNumber', phoneNumber }]);
      });

      it('should fail to update the email verification method if the verification code is wrong', async () => {
        let email = await appHelper.generateRandomEmail();
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        // try to update email with a code containing a typo
        email = await appHelper.generateRandomEmail();
        verificationCode = await appHelper.getWrongEmailVerificationCode(email);
        await expect(bobLaptop.setVerificationMethod({ email, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('should fail to update the phone number verification method if the verification code is wrong', async () => {
        let phoneNumber = await appHelper.generateRandomPhoneNumber();
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        // try to update phone number with a code containing a typo
        phoneNumber = await appHelper.generateRandomPhoneNumber();
        verificationCode = await appHelper.getWrongSMSVerificationCode(phoneNumber);
        await expect(bobLaptop.setVerificationMethod({ phoneNumber, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('should fail to update the email verification method if the verification code is not for the targeted email', async () => {
        const email = await appHelper.generateRandomEmail();
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        // try to update email with a code for another email address
        verificationCode = await appHelper.getEmailVerificationCode(email);
        const otherEmail = await appHelper.generateRandomEmail();
        await expect(bobLaptop.setVerificationMethod({ email: otherEmail, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('should fail to update the phone number verification method if the verification code is not for the targeted phone number', async () => {
        const phoneNumber = await appHelper.generateRandomPhoneNumber();
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        // try to update email with a code for another email address
        verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        const otherPhoneNumber = await appHelper.generateRandomPhoneNumber();
        await expect(bobLaptop.setVerificationMethod({ phoneNumber: otherPhoneNumber, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      describe('concurrent calls when managing user permanent identity', () => {
        it('cannot registerIdentity() before start() is resolved', async () => {
          const email = await appHelper.generateRandomEmail();
          const verificationCode = await appHelper.getEmailVerificationCode(email);

          const promise = bobPhone.start(bobIdentity);
          await expect(bobPhone.registerIdentity({ email, verificationCode })).to.be.rejectedWith(errors.PreconditionFailed, 'A mutually exclusive call is already in progress');
          await expect(promise).to.not.be.rejected;
        });

        it('cannot registerIdentity() concurrently', async () => {
          const email = await appHelper.generateRandomEmail();
          const email2 = await appHelper.generateRandomEmail();
          const verificationCode = await appHelper.getEmailVerificationCode(email);
          const verificationCode2 = await appHelper.getEmailVerificationCode(email2);

          await bobPhone.start(bobIdentity);
          const promise = bobPhone.registerIdentity({ email, verificationCode });
          await expect(bobPhone.registerIdentity({ email: email2, verificationCode: verificationCode2 })).to.be.rejectedWith(errors.PreconditionFailed, 'A mutually exclusive call is already in progress');
          await expect(promise).to.not.be.rejected;
        });

        it('cannot verifyIdentity() before registerIdentity() is resolved', async () => {
          const email = await appHelper.generateRandomEmail();
          const verificationCode = await appHelper.getEmailVerificationCode(email);

          await bobPhone.start(bobIdentity);
          const promise = bobPhone.registerIdentity({ email, verificationCode });
          await expect(bobPhone.verifyIdentity({ email, verificationCode })).to.be.rejectedWith(errors.PreconditionFailed, 'A mutually exclusive call is already in progress');
          await expect(promise).to.not.be.rejected;
        });

        it('cannot verifyIdentity() concurrently', async () => {
          const email = await appHelper.generateRandomEmail();
          let verificationCode = await appHelper.getEmailVerificationCode(email);

          await bobLaptop.registerIdentity({ email, verificationCode });
          verificationCode = await appHelper.getEmailVerificationCode(email);

          await bobPhone.start(bobIdentity);

          verificationCode = await appHelper.getEmailVerificationCode(email);
          const promise = bobPhone.verifyIdentity({ email, verificationCode });
          await expect(bobPhone.verifyIdentity({ email, verificationCode })).to.be.rejectedWith(errors.PreconditionFailed, 'A mutually exclusive call is already in progress');
          await expect(promise).to.not.be.rejected;
        });
      });
    });

    describe('verification by passphrase', () => {
      it('can register a verification passphrase and open a new device with it', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'passphrase' })).to.be.fulfilled;
      });

      it('fails to verify with a wrong passphrase', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'my wrong pass' })).to.be.rejectedWith(errors.InvalidVerification);

        // The status must not change so that retry is possible
        expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      });

      it(`gets throttled with a wrong passphrase over ${verificationThrottlingAttempts} times`, async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await bobPhone.start(bobIdentity);
        for (let i = 0; i < verificationThrottlingAttempts; ++i) {
          await expect(bobPhone.verifyIdentity({ passphrase: 'my wrong pass' })).to.be.rejectedWith(errors.InvalidVerification);
        }
        await expect(bobPhone.verifyIdentity({ passphrase: 'my wrong pass' })).to.be.rejectedWith(errors.TooManyAttempts);

        // The status must not change so that retry is possible
        expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      });

      it('can use passphrase if another verification method is throttled', async () => {
        const email = await appHelper.generateRandomEmail();
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        await bobLaptop.setVerificationMethod({ passphrase: 'passphrase' });

        verificationCode = await appHelper.getWrongEmailVerificationCode(email);

        await bobPhone.start(bobIdentity);
        for (let i = 0; i < verificationThrottlingAttempts; ++i) {
          await expect(bobPhone.verifyIdentity({ email, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
        }

        expect(bobPhone.verifyIdentity({ passphrase: 'passphrase' })).to.be.fulfilled;
      });

      it('fails to verify without having registered a passphrase', async () => {
        const email = await appHelper.generateRandomEmail();
        const phoneNumber = await appHelper.generateRandomPhoneNumber();
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        const phoneNumberVerificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.setVerificationMethod({ phoneNumber, verificationCode: phoneNumberVerificationCode });

        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'my pass' })).to.be.rejectedWith(errors.PreconditionFailed);

        // The status must not change so that retry is possible
        expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      });

      it('can register a verification passphrase, update it, and verify with the new passphrase only', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await bobLaptop.setVerificationMethod({ passphrase: 'new passphrase' });

        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'passphrase' })).to.be.rejectedWith(errors.InvalidVerification);
        await bobPhone.stop();

        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'new passphrase' })).to.be.fulfilled;
      });

      it('fails to setVerificationMethod with preverified email if preverified verification flag is disabled', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

        const email = await appHelper.generateRandomEmail();

        await expect(bobLaptop.setVerificationMethod({ preverifiedEmail: email })).to.be.rejectedWith(errors.PreconditionFailed);
      });

      it('fails to setVerificationMethod with preverified phone number if preverified verification flag is disabled', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        const phoneNumber = await appHelper.generateRandomPhoneNumber();

        await expect(bobLaptop.setVerificationMethod({ preverifiedPhoneNumber: phoneNumber })).to.be.rejectedWith(errors.PreconditionFailed);
      });
    });

    describe('verification by email', () => {
      let email: string;
      beforeEach(async () => {
        email = await appHelper.generateRandomEmail();
      });
      it('can register a verification email and verify with a valid verification code', async () => {
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        verificationCode = await appHelper.getEmailVerificationCode(email);
        await expect(expectVerification(bobPhone, bobIdentity, { email, verificationCode })).to.be.fulfilled;
      });

      it('fails to register with a wrong verification code', async () => {
        const verificationCode = await appHelper.getWrongEmailVerificationCode(email);
        await expect(bobLaptop.registerIdentity({ email, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);

        // The status must not change so that retry is possible
        expect(bobLaptop.status).to.equal(IDENTITY_REGISTRATION_NEEDED);
      });

      it('fails to verify with a wrong verification code', async () => {
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        verificationCode = await appHelper.getWrongEmailVerificationCode(email);
        await expect(expectVerification(bobPhone, bobIdentity, { email, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);

        // The status must not change so that retry is possible
        expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      });

      it(`should get throttled if email verification code is wrong over ${verificationThrottlingAttempts} times`, async () => {
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        verificationCode = await appHelper.getWrongEmailVerificationCode(email);

        await bobPhone.start(bobIdentity);
        for (let i = 0; i < verificationThrottlingAttempts; ++i) {
          await expect(bobPhone.verifyIdentity({ email, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
        }
        await expect(bobPhone.verifyIdentity({ email, verificationCode })).to.be.rejectedWith(errors.TooManyAttempts);
      });

      it('can use email if another verification method is throttled', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.setVerificationMethod({ email, verificationCode });

        await bobPhone.start(bobIdentity);
        for (let i = 0; i < verificationThrottlingAttempts; ++i) {
          await expect(bobPhone.verifyIdentity({ passphrase: 'my wrong pass' })).to.be.rejectedWith(errors.InvalidVerification);
        }

        verificationCode = await appHelper.getEmailVerificationCode(email);
        expect(bobPhone.verifyIdentity({ email, verificationCode })).to.be.fulfilled;
      });

      it('fails to verify without having registered an email address', async () => {
        const phoneNumber = await appHelper.generateRandomPhoneNumber();
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

        const phoneNumberVerificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.setVerificationMethod({ phoneNumber, verificationCode: phoneNumberVerificationCode });

        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await expect(expectVerification(bobPhone, bobIdentity, { email, verificationCode })).to.be.rejectedWith(errors.PreconditionFailed);

        // status must not change so that retry is possible
        expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      });
    });

    describe('verification by sms', () => {
      let phoneNumber: string;
      beforeEach(async () => {
        phoneNumber = await appHelper.generateRandomPhoneNumber();
      });
      it('can register a verification phone number and verify with a valid verification code', async () => {
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await expect(expectVerification(bobPhone, bobIdentity, { phoneNumber, verificationCode })).to.be.fulfilled;
      });

      it('fails to register with a wrong verification code', async () => {
        const verificationCode = await appHelper.getWrongSMSVerificationCode(phoneNumber);
        await expect(bobLaptop.registerIdentity({ phoneNumber, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);

        // The status must not change so that retry is possible
        expect(bobLaptop.status).to.equal(IDENTITY_REGISTRATION_NEEDED);
      });

      it('fails to verify with a wrong verification code', async () => {
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        verificationCode = await appHelper.getWrongSMSVerificationCode(phoneNumber);
        await expect(expectVerification(bobPhone, bobIdentity, { phoneNumber, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);

        // The status must not change so that retry is possible
        expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      });

      it(`should get throttled if the verification code is wrong over ${verificationThrottlingAttempts} times`, async () => {
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        verificationCode = await appHelper.getWrongSMSVerificationCode(phoneNumber);

        await bobPhone.start(bobIdentity);

        for (let i = 0; i < verificationThrottlingAttempts; ++i) {
          await expect(bobPhone.verifyIdentity({ phoneNumber, verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
        }
        await expect(bobPhone.verifyIdentity({ phoneNumber, verificationCode })).to.be.rejectedWith(errors.TooManyAttempts);
      });

      it('an use phone number if another verification method is throttled', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.setVerificationMethod({ phoneNumber, verificationCode });

        await bobPhone.start(bobIdentity);
        for (let i = 0; i < verificationThrottlingAttempts; ++i) {
          await expect(bobPhone.verifyIdentity({ passphrase: 'my wrong pass' })).to.be.rejectedWith(errors.InvalidVerification);
        }

        verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);

        expect(bobPhone.verifyIdentity({ phoneNumber, verificationCode })).to.be.fulfilled;
      });

      it('fails to verify without having registered a phone number', async () => {
        const email = await appHelper.generateRandomEmail();
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

        const emailVerificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.setVerificationMethod({ email, verificationCode: emailVerificationCode });

        const verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await expect(expectVerification(bobPhone, bobIdentity, { phoneNumber, verificationCode })).to.be.rejectedWith(errors.PreconditionFailed);

        // status must not change so that retry is possible
        expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      });
    });

    describe('verification with preverified email', () => {
      let email: string;
      let preverifiedEmail: string;

      beforeEach(async () => {
        await appHelper.setPreverifiedMethodEnabled();
        email = await appHelper.generateRandomEmail();
        preverifiedEmail = await appHelper.generateRandomEmail();
      });

      it('fails when registering with a preverified email', async () => {
        await expect(bobLaptop.registerIdentity({ preverifiedEmail })).to.be.rejectedWith(errors.InvalidArgument, 'cannot register identity with preverified methods');
      });

      it('fails when verifying identity with preverified email', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        await bobPhone.start(bobIdentity);
        await expect(bobPhone.verifyIdentity({ preverifiedEmail: email })).to.be.rejectedWith(errors.InvalidArgument, 'cannot verify identity with preverified methods');
      });

      it('registers with an email, updates to preverified email when calling setVerificationMethod, and updates to normal email when verifying', async () => {
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedEmail });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'preverifiedEmail', preverifiedEmail }]);

        await bobPhone.start(bobIdentity);
        verificationCode = await appHelper.getEmailVerificationCode(preverifiedEmail);
        await bobPhone.verifyIdentity({ email: preverifiedEmail, verificationCode });

        expect(await bobPhone.getVerificationMethods()).to.have.deep.members([{ type: 'email', email: preverifiedEmail }]);
      });

      it('register with an email, updates to preverified email when calling setVerificationMethod with the same email', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedEmail: email });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'preverifiedEmail', preverifiedEmail: email }]);
      });

      it('turns preverified email method into email method when calling setVerificationMethod', async () => {
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedEmail });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'preverifiedEmail', preverifiedEmail }]);

        verificationCode = await appHelper.getEmailVerificationCode(preverifiedEmail);
        await bobLaptop.setVerificationMethod({ email: preverifiedEmail, verificationCode });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'email', email: preverifiedEmail }]);
      });

      it('turns preverified email method into email method when calling verifyProvisionalIdentity', async () => {
        const verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedEmail });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'preverifiedEmail', preverifiedEmail }]);

        const provisionalIdentity = await appHelper.generateEmailProvisionalIdentity(preverifiedEmail);

        await appHelper.attachVerifyEmailProvisionalIdentity(bobLaptop, provisionalIdentity);

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'email', email: preverifiedEmail }]);
      });

      it('adds preverified email as a new verification method', async () => {
        const phoneNumber = await appHelper.generateRandomPhoneNumber();
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedEmail });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([
          { type: 'phoneNumber', phoneNumber }, { type: 'preverifiedEmail', preverifiedEmail }]);

        await bobPhone.start(bobIdentity);
        verificationCode = await appHelper.getEmailVerificationCode(preverifiedEmail);
        await bobPhone.verifyIdentity({ email: preverifiedEmail, verificationCode });

        expect(await bobPhone.getVerificationMethods()).to.have.deep.members([
          { type: 'phoneNumber', phoneNumber }, { type: 'email', email: preverifiedEmail }]);
      });
    });

    describe('verification with preverified phone number', () => {
      let phoneNumber: string;
      let preverifiedPhoneNumber: string;

      beforeEach(async () => {
        await appHelper.setPreverifiedMethodEnabled();
        phoneNumber = await appHelper.generateRandomPhoneNumber();
        preverifiedPhoneNumber = await appHelper.generateRandomPhoneNumber();
      });

      it('fails when registering with a preverified phone number', async () => {
        await expect(bobLaptop.registerIdentity({ preverifiedPhoneNumber })).to.be.rejectedWith(errors.InvalidArgument, 'cannot register identity with preverified methods');
      });

      it('fails when verifying identity with preverified phone number', async () => {
        const verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        await bobPhone.start(bobIdentity);
        await expect(bobPhone.verifyIdentity({ preverifiedPhoneNumber: phoneNumber })).to.be.rejectedWith(errors.InvalidArgument, 'cannot verify identity with preverified methods');
      });

      it('registers with a phone number, updates to preverified phone number when calling setVerificationMethod, and updates to normal phone number when verifying', async () => {
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedPhoneNumber });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'preverifiedPhoneNumber', preverifiedPhoneNumber }]);

        await bobPhone.start(bobIdentity);
        verificationCode = await appHelper.getSMSVerificationCode(preverifiedPhoneNumber);
        await bobPhone.verifyIdentity({ phoneNumber: preverifiedPhoneNumber, verificationCode });

        expect(await bobPhone.getVerificationMethods()).to.have.deep.members([{ type: 'phoneNumber', phoneNumber: preverifiedPhoneNumber }]);
      });

      it('register with a phone number, updates to preverified phone number when calling setVerificationMethod with the same phone number', async () => {
        const verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedPhoneNumber: phoneNumber });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'preverifiedPhoneNumber', preverifiedPhoneNumber: phoneNumber }]);
      });

      it('turns preverified phone number method into phone number method when calling setVerificationMethod', async () => {
        let verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedPhoneNumber });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'preverifiedPhoneNumber', preverifiedPhoneNumber }]);

        verificationCode = await appHelper.getSMSVerificationCode(preverifiedPhoneNumber);
        await bobLaptop.setVerificationMethod({ phoneNumber: preverifiedPhoneNumber, verificationCode });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'phoneNumber', phoneNumber: preverifiedPhoneNumber }]);
      });

      it('turns preverified phone number method into phone number method when calling verifyProvisionalIdentity', async () => {
        const verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobLaptop.registerIdentity({ phoneNumber, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedPhoneNumber });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'preverifiedPhoneNumber', preverifiedPhoneNumber }]);

        const provisionalIdentity = await appHelper.generatePhoneNumberProvisionalIdentity(preverifiedPhoneNumber);

        await appHelper.attachVerifyPhoneNumberProvisionalIdentity(bobLaptop, provisionalIdentity);

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'phoneNumber', phoneNumber: preverifiedPhoneNumber }]);
      });

      it('adds preverified phone number as a new verification method', async () => {
        const email = await appHelper.generateRandomEmail();
        let verificationCode = await appHelper.getEmailVerificationCode(email);
        await bobLaptop.registerIdentity({ email, verificationCode });

        await bobLaptop.setVerificationMethod({ preverifiedPhoneNumber });

        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([
          { type: 'email', email }, { type: 'preverifiedPhoneNumber', preverifiedPhoneNumber }]);

        await bobPhone.start(bobIdentity);
        verificationCode = await appHelper.getSMSVerificationCode(preverifiedPhoneNumber);
        await bobPhone.verifyIdentity({ phoneNumber: preverifiedPhoneNumber, verificationCode });

        expect(await bobPhone.getVerificationMethods()).to.have.deep.members([
          { type: 'email', email }, { type: 'phoneNumber', phoneNumber: preverifiedPhoneNumber }]);
      });
    });

    describe('verification key', () => {
      const corruptVerificationKey = (key: b64string, field: string, position: number): b64string => {
        const unwrappedKey = utils.fromB64Json(key);
        const unwrappedField = utils.fromBase64(unwrappedKey[field]);
        unwrappedField[position] += 1;
        unwrappedKey[field] = utils.toBase64(unwrappedField);
        return utils.toB64Json(unwrappedKey);
      };

      let verificationKey: string;
      let verificationKeyNotUsed: string;

      beforeEach(async () => {
        verificationKeyNotUsed = await bobLaptop.generateVerificationKey();
        verificationKey = await bobLaptop.generateVerificationKey();
      });

      it('can use a generated verification key to register', async () => {
        await bobLaptop.registerIdentity({ verificationKey });
        expect(bobLaptop.status).to.equal(READY);
      });

      it('does list the verification key as the unique verification method', async () => {
        await bobLaptop.registerIdentity({ verificationKey });
        expect(await bobLaptop.getVerificationMethods()).to.have.deep.members([{ type: 'verificationKey' }]);
      });

      it('can verify with a verification key', async () => {
        await bobLaptop.registerIdentity({ verificationKey });
        await expect(expectVerification(bobPhone, bobIdentity, { verificationKey })).to.be.fulfilled;
      });

      it('should throw if setting another verification method after verification key has been used', async () => {
        await bobLaptop.registerIdentity({ verificationKey });
        await expect(bobLaptop.setVerificationMethod({ passphrase: 'passphrase' })).to.be.rejectedWith(errors.PreconditionFailed);
      });

      it('refuses to register two users with the same verificationKey', async () => {
        const aliceId = uuid.v4();
        const aliceIdentity = await appHelper.generateIdentity(aliceId);
        const aliceLaptop = args.makeTanker();
        await aliceLaptop.start(aliceIdentity);
        await aliceLaptop.registerIdentity({ verificationKey });

        await expect(bobLaptop.registerIdentity({ verificationKey })).to.be.rejectedWith(errors.Conflict);
      });

      describe('register identity with an invalid verification key', () => {
        beforeEach(async () => {
          await bobPhone.start(bobIdentity);
        });

        it('throws InvalidVerification when using an obviously wrong verification key', async () => {
          await expect(bobPhone.registerIdentity({ verificationKey: 'not_a_verification_key' })).to.be.rejectedWith(errors.InvalidVerification);

          // The status must not change so that retry is possible
          expect(bobPhone.status).to.equal(IDENTITY_REGISTRATION_NEEDED);
        });

        it('throws InvalidVerification when using a corrupt verification key', async () => {
          const badKeys = [
            corruptVerificationKey(verificationKey, 'privateSignatureKey', 4), // private part
            corruptVerificationKey(verificationKey, 'privateSignatureKey', 60), // public part
            // privateEncryptionKey can't be corrupted before registration...
          ];

          for (let i = 0; i < badKeys.length; i++) {
            const badKey = badKeys[i]!;
            await expect(bobPhone.registerIdentity({ verificationKey: badKey }), `bad verification key #${i}`).to.be.rejectedWith(errors.InvalidVerification);
            // The status must not change so that retry is possible
            expect(bobPhone.status).to.equal(IDENTITY_REGISTRATION_NEEDED);
          }
        });
      });

      describe('verify identity with an invalid verification key', () => {
        beforeEach(async () => {
          await bobLaptop.registerIdentity({ verificationKey });
          await bobPhone.start(bobIdentity);
        });

        it('throws InvalidVerification when using an obviously wrong verification key', async () => {
          await expect(bobPhone.verifyIdentity({ verificationKey: 'not_a_verification_key' })).to.be.rejectedWith(errors.InvalidVerification);

          // The status must not change so that retry is possible
          expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
        });

        it('throws InvalidVerification when using a verification key different from the one used at registration', async () => {
          await expect(bobPhone.verifyIdentity({ verificationKey: verificationKeyNotUsed })).to.be.rejectedWith(errors.InvalidVerification);

          // The status must not change so that retry is possible
          expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
        });

        it('throws InvalidVerification when using a verification key fron a different user', async () => {
          const aliceId = uuid.v4();
          const aliceIdentity = await appHelper.generateIdentity(aliceId);
          const aliceLaptop = args.makeTanker();
          await aliceLaptop.start(aliceIdentity);
          const aliceVerificationKey = await aliceLaptop.generateVerificationKey();
          await aliceLaptop.registerIdentity({ verificationKey: aliceVerificationKey });

          await expect(bobPhone.verifyIdentity({ verificationKey: aliceVerificationKey })).to.be.rejectedWith(errors.InvalidVerification);

          // The status must not change so that retry is possible
          expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
        });

        it('throws InvalidVerification when using a corrupt verification key', async () => {
          const badKeys = [
            corruptVerificationKey(verificationKey, 'privateSignatureKey', 4), // corrupt private part
            corruptVerificationKey(verificationKey, 'privateSignatureKey', 60), // corrupt public part
            corruptVerificationKey(verificationKey, 'privateEncryptionKey', 4), // does not match the one used at registration
          ];

          for (let i = 0; i < badKeys.length; i++) {
            const badKey = badKeys[i]!;
            await expect(bobPhone.verifyIdentity({ verificationKey: badKey }), `bad verification key #${i}`).to.be.rejectedWith(errors.InvalidVerification);
            // The status must not change so that retry is possible
            expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
          }
        });
      });

      describe('/verification/email/code HTTP request', () => {
        it('works', async () => {
          const email = await appHelper.generateRandomEmail();
          const url = `${trustchaindUrl}/verification/email/code`;
          const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
              app_id: utils.toBase64(args.appHelper.appId),
              auth_token: args.appHelper.authToken,
              email,
            }),
          });
          expect(response.status).to.eq(200);
          const { verification_code: verificationCode } = await response.json();
          expect(verificationCode).to.not.be.undefined;
          await bobLaptop.registerIdentity({ email, verificationCode });
          const actualMethods = await bobLaptop.getVerificationMethods();
          expect(actualMethods).to.have.deep.members([{ type: 'email', email }]);
        });
      });

      describe('/verification/sms/code HTTP request', () => {
        it('works', async () => {
          const phoneNumber = await appHelper.generateRandomPhoneNumber();
          const url = `${trustchaindUrl}/verification/sms/code`;
          const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
              app_id: utils.toBase64(args.appHelper.appId),
              auth_token: args.appHelper.authToken,
              phone_number: phoneNumber,
            }),
          });
          expect(response.status).to.eq(200);
          const { verification_code: verificationCode } = await response.json();
          expect(verificationCode).to.not.be.undefined;
          await bobLaptop.registerIdentity({ phoneNumber, verificationCode });
          const actualMethods = await bobLaptop.getVerificationMethods();
          expect(actualMethods).to.have.deep.members([{ type: 'phoneNumber', phoneNumber }]);
        });
      });
    });
  });
};
