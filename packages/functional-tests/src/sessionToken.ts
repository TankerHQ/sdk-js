import { errors } from '@tanker/core';
import type { Tanker, b64string } from '@tanker/core';
import { expect, uuid } from '@tanker/test-utils';

import { getPublicIdentity } from '@tanker/identity';
import { utils } from '@tanker/crypto';
import { fetch } from '@tanker/http-utils';
import type { AppHelper, TestArgs } from './helpers';
import { trustchaindUrl } from './helpers';

async function checkSessionToken(appHelper: AppHelper, publicIdentity: b64string, token: b64string, allowedMethods: Array<Record<string, any>>) {
  const url = `${trustchaindUrl}/verification/session-token`;
  const body = {
    app_id: utils.toBase64(appHelper.appId),
    auth_token: appHelper.authToken,
    public_identity: publicIdentity,
    session_token: token,
    allowed_methods: allowedMethods,
  };
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export const generateSessionTokenTests = (args: TestArgs) => {
  describe('session token (2FA)', () => {
    let bobLaptop: Tanker;
    let bobIdentity: b64string;
    let bobPublicIdentity: b64string;
    let appHelper: AppHelper;

    before(() => {
      ({ appHelper } = args);
    });

    beforeEach(async () => {
      await appHelper.setPreverifiedMethodEnabled();
      const bobId = uuid.v4();
      bobIdentity = await appHelper.generateIdentity(bobId);
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      bobLaptop = args.makeTanker();
      await bobLaptop.start(bobIdentity);
    });

    afterEach(async () => {
      await Promise.all([
        bobLaptop.stop(),
      ]);
    });

    it('can get a session token from registerIdentity', async () => {
      const email = 'john.doe@tanker.io';
      const verificationCode = await appHelper.getEmailVerificationCode(email);
      const token = await bobLaptop.registerIdentity({ email, verificationCode }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token!, [{
        type: 'email',
        email,
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('email');
    });

    it('cannot get a session token with a verification key', async () => {
      const verificationKey = await bobLaptop.generateVerificationKey();
      const registerFut = bobLaptop.registerIdentity({ verificationKey }, { withSessionToken: true });
      await expect(registerFut).to.be.rejectedWith(errors.InvalidArgument, 'cannot get a session token for a verification key');
    });

    it('can check a session token with multiple allowed methods', async () => {
      const email = 'john.deer@tanker.io';
      const phoneNumber = '+33639986789';
      const verificationCode = await appHelper.getEmailVerificationCode(email);
      const token = await bobLaptop.registerIdentity({ email, verificationCode }, { withSessionToken: true });
      const phoneNumberVerificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
      await bobLaptop.setVerificationMethod({ phoneNumber, verificationCode: phoneNumberVerificationCode });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token!, [{
        type: 'oidc_id_token',
      }, {
        type: 'passphrase',
      }, {
        type: 'email',
        email,
      }, {
        type: 'phone_number',
        phone_number: phoneNumber,
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('email');
    });

    it('fails to check a session token if the allowed_method is wrong', async () => {
      const email = 'john.smith@tanker.io';
      const verificationCode = await appHelper.getEmailVerificationCode(email);
      const token = await bobLaptop.registerIdentity({ email, verificationCode }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token!, [{
        type: 'oidc_id_token',
      }]);
      expect(response.status).to.eq(401);
    });

    it('fails to check a session token if the token is invalid', async () => {
      const email = 'john.smith@tanker.io';
      const verificationCode = await appHelper.getEmailVerificationCode(email);
      const token = await bobLaptop.registerIdentity({ email, verificationCode }, { withSessionToken: true });
      expect(token).to.be.a('string');
      const badToken = `a${token}`;

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, badToken, [{
        type: 'email',
        email,
      }]);
      expect(response.status).to.eq(400);
    });

    it('fails when using setVerificationMethod to get a session token with a preverified email', async () => {
      await bobLaptop.registerIdentity({ passphrase: 'Space and time are not what you think' });

      const preverifiedEmail = 'john.doe@tanker.io';
      await expect(bobLaptop.setVerificationMethod({ preverifiedEmail }, { withSessionToken: true })).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('fails when using setVerificationMethod to get a session token with a preverified phone number', async () => {
      await bobLaptop.registerIdentity({ passphrase: 'Space and time are not what you think' });

      const preverifiedPhoneNumber = '+33639986789';
      await expect(bobLaptop.setVerificationMethod({ preverifiedPhoneNumber }, { withSessionToken: true })).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('can use setVerificationMethod with email to get a session token', async () => {
      await bobLaptop.registerIdentity({ passphrase: 'Space and time are not what you think' });

      const email = 'john.doe@tanker.io';
      const verificationCode = await appHelper.getEmailVerificationCode(email);
      const token = await bobLaptop.setVerificationMethod({ email, verificationCode }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token!, [{
        type: 'email',
        email,
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('email');
    });

    it('can use setVerificationMethod with phone number to get a session token', async () => {
      await bobLaptop.registerIdentity({ passphrase: 'Space and time are not what you think' });

      const phoneNumber = await appHelper.generateRandomPhoneNumber();
      const verificationCode = await appHelper.getSMSVerificationCode(phoneNumber);
      const token = await bobLaptop.setVerificationMethod({ phoneNumber, verificationCode }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token!, [{
        type: 'phone_number',
        phone_number: phoneNumber,
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('phone_number');
    });

    it('can use verifyIdentity to get a session token when Ready', async () => {
      const passphrase = 'Observers disagree about the lengths of objects';
      await bobLaptop.registerIdentity({ passphrase });
      const token = await bobLaptop.verifyIdentity({ passphrase }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token!, [{
        type: 'passphrase',
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('passphrase');
    });
  });
};
