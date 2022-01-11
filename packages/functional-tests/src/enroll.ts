import type { Tanker, b64string, PreverifiedPhoneNumberVerification, PreverifiedEmailVerification } from '@tanker/core';
import { expect } from '@tanker/test-utils';
import { getPublicIdentity } from '@tanker/identity';
import { statuses, errors } from '@tanker/core';
import { expectDecrypt } from './helpers';

import type { TestArgs, AppHelper } from './helpers';

export const generateEnrollTests = (args: TestArgs) => {
  describe('Enrolling users', () => {
    const email = 'bob@tanker.io';
    const phoneNumber = '+33639986789';

    let server: Tanker;
    let appHelper: AppHelper;
    let bobIdentity: b64string;
    let emailVerification: PreverifiedEmailVerification;
    let phoneNumberVerification: PreverifiedPhoneNumberVerification;

    before(() => {
      server = args.makeTanker();
      ({ appHelper } = args);

      emailVerification = {
        preverifiedEmail: email,
      };
      phoneNumberVerification = {
        preverifiedPhoneNumber: phoneNumber,
      };
    });

    beforeEach(async () => {
      bobIdentity = await appHelper.generateIdentity();
    });

    describe('server', () => {
      describe('with user enrollment disabled', () => {
        it('fails to enroll a user with an email address', async () => {
          await expect(server.enrollUser(bobIdentity, [emailVerification])).to.be.rejectedWith(errors.PreconditionFailed);
        });

        it('fails to enroll a user with a phone number', async () => {
          await expect(server.enrollUser(bobIdentity, [phoneNumberVerification])).to.be.rejectedWith(errors.PreconditionFailed);
        });

        it('fails to enroll a user with both an email address and a phone number', async () => {
          await expect(server.enrollUser(bobIdentity, [emailVerification, phoneNumberVerification])).to.be.rejectedWith(errors.PreconditionFailed);
        });
      });

      describe('with user enrollment enabled', () => {
        before(async () => {
          await appHelper.setEnrollUsersEnabled();
        });

        it('enrolls a user with an email address', async () => {
          await expect(server.enrollUser(bobIdentity, [emailVerification])).to.be.fulfilled;
        });

        it('enrolls a user with a phone number', async () => {
          await expect(server.enrollUser(bobIdentity, [phoneNumberVerification])).to.be.fulfilled;
        });

        it('throws when enrolling a user multiple times', async () => {
          await expect(server.enrollUser(bobIdentity, [emailVerification])).to.be.fulfilled;
          await expect(server.enrollUser(bobIdentity, [phoneNumberVerification])).to.be.rejectedWith(errors.Conflict);
        });

        it('throws when enrolling a registered user', async () => {
          const bobLaptop = args.makeTanker();
          await bobLaptop.start(bobIdentity);
          await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

          await expect(server.enrollUser(bobIdentity, [emailVerification])).to.be.rejectedWith(errors.Conflict);
        });

        it('enrolls a user with both an email address and a phone number', async () => {
          await expect(server.enrollUser(bobIdentity, [emailVerification, phoneNumberVerification])).to.be.fulfilled;
        });

        it('stays STOPPED after enrolling a user', async () => {
          await expect(server.enrollUser(bobIdentity, [emailVerification, phoneNumberVerification])).to.be.fulfilled;
          expect(server.status).to.equal(statuses.STOPPED);
        });
      });
    });

    describe('enrolled user', () => {
      let bobLaptop: Tanker;
      let bobPhone: Tanker;
      let bobPubIdentity: b64string;
      const clearText = 'new enrollment feature';

      before(async () => {
        await appHelper.setEnrollUsersEnabled();
      });

      beforeEach(async () => {
        bobLaptop = args.makeTanker();
        bobPubIdentity = await getPublicIdentity(bobIdentity);
        await server.enrollUser(bobIdentity, [emailVerification, phoneNumberVerification]);

        const disposableIdentity = await appHelper.generateIdentity();
        await server.start(disposableIdentity);
        const verificationKey = await server.generateVerificationKey();
        await server.registerIdentity({ verificationKey });
      });

      afterEach(async () => {
        await server.stop();
      });

      it('must verify new devices', async () => {
        bobPhone = args.makeTanker();

        await bobLaptop.start(bobIdentity);
        await bobPhone.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        const phoneNumberCode = await appHelper.getSMSVerificationCode(phoneNumber);

        expect(bobLaptop.status).to.eq(statuses.IDENTITY_VERIFICATION_NEEDED);
        expect(bobPhone.status).to.eq(statuses.IDENTITY_VERIFICATION_NEEDED);

        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;
        await expect(bobPhone.verifyIdentity({ phoneNumber, verificationCode: phoneNumberCode })).to.be.fulfilled;
      });

      it('can attache a provisional identity', async () => {
        const provisionalIdentity = await appHelper.generateEmailProvisionalIdentity(email);
        const encryptedTest = await server.encrypt(clearText, { shareWithUsers: [provisionalIdentity.publicIdentity], shareWithSelf: false });

        await bobLaptop.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;
        await expect(bobLaptop.attachProvisionalIdentity(provisionalIdentity.identity)).to.be.fulfilled;

        await expectDecrypt([bobLaptop], clearText, encryptedTest);
      });

      it('access data shared before first verification', async () => {
        const encryptedTest = await server.encrypt(clearText, { shareWithUsers: [bobPubIdentity], shareWithSelf: false });

        await bobLaptop.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;

        await expectDecrypt([bobLaptop], clearText, encryptedTest);
      });

      it('can be added to group before first verification', async () => {
        const groupId = await server.createGroup([bobPubIdentity]);

        const encryptedTest = await server.encrypt(clearText, { shareWithGroups: [groupId], shareWithSelf: false });

        await bobLaptop.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;

        await expectDecrypt([bobLaptop], clearText, encryptedTest);
      });

      it('decrypts data shared with a provisional identity through a group before first verification', async () => {
        const provisionalIdentity = await appHelper.generateEmailProvisionalIdentity(email);

        const groupId = await server.createGroup([provisionalIdentity.publicIdentity]);
        const encryptedTest = await server.encrypt(clearText, { shareWithGroups: [groupId], shareWithSelf: false });

        await bobLaptop.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;
        await expect(bobLaptop.attachProvisionalIdentity(provisionalIdentity.identity)).to.be.fulfilled;

        await expectDecrypt([bobLaptop], clearText, encryptedTest);
      });
    });
  });
};
