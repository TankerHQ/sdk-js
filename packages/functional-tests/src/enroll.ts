import type { Tanker, b64string, PreverifiedPhoneNumberVerification, PreverifiedEmailVerification, PreverifiedOidcVerification } from '@tanker/core';
import { expect } from '@tanker/test-utils';
import { getPublicIdentity } from '@tanker/identity';
import { statuses, errors } from '@tanker/core';
import { expectDecrypt, oidcSettings } from './helpers';

import type { TestArgs, AppHelper } from './helpers';
import { extractSubject, getGoogleIdToken } from './helpers';

export const generateEnrollTests = (args: TestArgs) => {
  describe('Enrolling users', () => {
    const email = 'bob@tanker.io';
    const phoneNumber = '+33639986789';

    let server: Tanker;
    let appHelper: AppHelper;
    let bobIdentity: b64string;
    let emailVerification: PreverifiedEmailVerification;
    let phoneNumberVerification: PreverifiedPhoneNumberVerification;
    let oidcVerification: PreverifiedOidcVerification;
    let providerId: string;

    before(async () => {
      server = args.makeTanker();
      ({ appHelper } = args);

      const config = await appHelper.setOidc();
      providerId = config.app.oidc_providers[0]!.id;

      emailVerification = {
        preverifiedEmail: email,
      };
      phoneNumberVerification = {
        preverifiedPhoneNumber: phoneNumber,
      };
      oidcVerification = {
        oidcProviderId: providerId,
        preverifiedOidcSubject: 'a subject',
      };
    });

    beforeEach(async () => {
      bobIdentity = await appHelper.generateIdentity();
    });

    describe('user not enrolled yet', () => {
      it('enrolls a user with an email address [53ZC44]', async () => {
        await expect(server.enrollUser(bobIdentity, [emailVerification])).to.be.fulfilled;
      });

      it('enrolls a user with a phone number [DEJGHP]', async () => {
        await expect(server.enrollUser(bobIdentity, [phoneNumberVerification])).to.be.fulfilled;
      });

      it('enrolls a user with an oidc', async () => {
        await expect(server.enrollUser(bobIdentity, [oidcVerification])).to.be.fulfilled;
      });

      it('throws when enrolling a user multiple times [BMANVI]', async () => {
        await expect(server.enrollUser(bobIdentity, [emailVerification])).to.be.fulfilled;
        await expect(server.enrollUser(bobIdentity, [phoneNumberVerification])).to.be.rejectedWith(errors.Conflict);
      });

      it('throws when enrolling a registered user [02NKOO]', async () => {
        const bobLaptop = args.makeTanker();
        await bobLaptop.start(bobIdentity);
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

        await expect(server.enrollUser(bobIdentity, [emailVerification])).to.be.rejectedWith(errors.Conflict);
      });

      it('enrolls a user with both an email address and a phone number [FJJCBC]', async () => {
        await expect(server.enrollUser(bobIdentity, [emailVerification, phoneNumberVerification])).to.be.fulfilled;
      });

      it('stays STOPPED after enrolling a user [ED45GK]', async () => {
        await expect(server.enrollUser(bobIdentity, [emailVerification, phoneNumberVerification])).to.be.fulfilled;
        expect(server.status).to.equal(statuses.STOPPED);
      });
    });

    describe('enrolled user', () => {
      let bobLaptop: Tanker;
      let bobPhone: Tanker;
      let bobTablet: Tanker;
      let bobPubIdentity: b64string;
      let bobIdToken: string;
      const clearText = 'new enrollment feature';

      before(async () => {
        // Let's say Martine is bob's middle name
        bobIdToken = await getGoogleIdToken(oidcSettings.googleAuth.users.martine.refreshToken);
        oidcVerification.preverifiedOidcSubject = extractSubject(bobIdToken);
      });

      after(async () => {
        await appHelper.unsetOidc();
      });

      beforeEach(async () => {
        bobLaptop = args.makeTanker();
        bobPubIdentity = await getPublicIdentity(bobIdentity);
        await server.enrollUser(bobIdentity, [emailVerification, phoneNumberVerification, oidcVerification]);

        const disposableIdentity = await appHelper.generateIdentity();
        await server.start(disposableIdentity);
        const verificationKey = await server.generateVerificationKey();
        await server.registerIdentity({ verificationKey });
      });

      afterEach(async () => {
        await server.stop();
      });

      it('must verify new devices [FJQEQC]', async () => {
        bobPhone = args.makeTanker();
        bobTablet = args.makeTanker();

        await bobLaptop.start(bobIdentity);
        await bobPhone.start(bobIdentity);
        await bobTablet.start(bobIdentity);

        const emailCode = await appHelper.getEmailVerificationCode(email);
        const phoneNumberCode = await appHelper.getSMSVerificationCode(phoneNumber);
        await bobTablet.setOidcTestNonce(await bobTablet.createOidcNonce());

        expect(bobLaptop.status).to.eq(statuses.IDENTITY_VERIFICATION_NEEDED);
        expect(bobPhone.status).to.eq(statuses.IDENTITY_VERIFICATION_NEEDED);
        expect(bobTablet.status).to.eq(statuses.IDENTITY_VERIFICATION_NEEDED);

        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;
        await expect(bobPhone.verifyIdentity({ phoneNumber, verificationCode: phoneNumberCode })).to.be.fulfilled;
        await expect(bobTablet.verifyIdentity({ oidcIdToken: bobIdToken })).to.be.fulfilled;
      });

      it('can attache a provisional identity [BV4VOS]', async () => {
        const provisionalIdentity = await appHelper.generateEmailProvisionalIdentity(email);
        const encryptedTest = await server.encrypt(clearText, { shareWithUsers: [provisionalIdentity.publicIdentity], shareWithSelf: false });

        await bobLaptop.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;
        await expect(bobLaptop.attachProvisionalIdentity(provisionalIdentity.identity)).to.be.fulfilled;

        await expectDecrypt([bobLaptop], clearText, encryptedTest);
      });

      it('access data shared before first verification [PJW7DE]', async () => {
        const encryptedTest = await server.encrypt(clearText, { shareWithUsers: [bobPubIdentity], shareWithSelf: false });

        await bobLaptop.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;

        await expectDecrypt([bobLaptop], clearText, encryptedTest);
      });

      it('can be added to group before first verification [KQABZ5]', async () => {
        const groupId = await server.createGroup([bobPubIdentity]);

        const encryptedTest = await server.encrypt(clearText, { shareWithGroups: [groupId], shareWithSelf: false });

        await bobLaptop.start(bobIdentity);
        const emailCode = await appHelper.getEmailVerificationCode(email);
        await expect(bobLaptop.verifyIdentity({ email, verificationCode: emailCode })).to.be.fulfilled;

        await expectDecrypt([bobLaptop], clearText, encryptedTest);
      });

      it('decrypts data shared with a provisional identity through a group before first verification [847P9U]', async () => {
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
