import { statuses, errors } from '@tanker/core';
import type { Tanker, b64string, PreverifiedPhoneNumberVerification, PreverifiedEmailVerification } from '@tanker/core';
import { expect } from '@tanker/test-utils';

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

      before(async () => {
        await appHelper.setEnrollUsersEnabled();
      });

      it('must only verify new devices', async () => {
        bobLaptop = args.makeTanker();
        bobPhone = args.makeTanker();

        await server.enrollUser(bobIdentity, [emailVerification, phoneNumberVerification]);
        await bobLaptop.start(bobIdentity);
        await bobPhone.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        const phoneNumberCode = await appHelper.getSMSVerificationCode(phoneNumber);

        expect(bobLaptop.status).to.eq(statuses.IDENTITY_VERIFICATION_NEEDED);
        expect(bobPhone.status).to.eq(statuses.IDENTITY_VERIFICATION_NEEDED);

        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;
        await expect(bobPhone.verifyIdentity({ phoneNumber, verificationCode: phoneNumberCode })).to.be.fulfilled;
      });
    });
  });
};
