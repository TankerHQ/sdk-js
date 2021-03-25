// @flow
import { errors } from '@tanker/core';
import { expect, uuid } from '@tanker/test-utils';

import { getPublicIdentity } from '@tanker/identity';
import { utils } from '@tanker/crypto';
import { fetch } from '@tanker/http-utils';
import type { TestArgs } from './helpers';
import { trustchaindUrl } from './helpers';

async function checkSessionToken(appHelper, publicIdentity, token, allowedMethods: Array<Object>) {
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
    body: JSON.stringify(body)
  });
}

export const generateSessionTokenTests = (args: TestArgs) => {
  describe('session token (2FA)', () => {
    let bobLaptop;
    let bobIdentity;
    let bobPublicIdentity;
    let appHelper;

    before(() => {
      ({ appHelper } = args);
    });

    beforeEach(async () => {
      await appHelper.set2FA();
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

    it('can get a session token after registerIdentity', async () => {
      const email = 'john.doe@tanker.io';
      const verificationCode = await appHelper.getVerificationCode(email);
      const token = await bobLaptop.registerIdentity({ email, verificationCode }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token, [{
        type: 'email',
        email,
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('email');
    });

    it('can use setVerificationMethod to get a session token', async () => {
      await bobLaptop.registerIdentity({ passphrase: 'Space and time are not what you think' });

      const email = 'john.doe@tanker.io';
      const verificationCode = await appHelper.getVerificationCode(email);
      const token = await bobLaptop.setVerificationMethod({ email, verificationCode }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token, [{
        type: 'email',
        email,
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('email');
    });

    it('can use verifyIdentity to get a session token when Ready', async () => {
      const passphrase = 'Observers disagree about the lengths of objects';
      await bobLaptop.registerIdentity({ passphrase });
      const token = await bobLaptop.verifyIdentity({ passphrase }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token, [{
        type: 'passphrase',
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('passphrase');
    });

    it('can check a session token with multiple allowed methods', async () => {
      const email = 'john.deer@tanker.io';
      const verificationCode = await appHelper.getVerificationCode(email);
      const token = await bobLaptop.registerIdentity({ email, verificationCode }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token, [{
        type: 'oidc_id_token',
      }, {
        type: 'passphrase',
      }, {
        type: 'email',
        email,
      }]);
      expect(response.status).to.eq(200);
      const result = await response.json();
      expect(result.verification_method).to.eq('email');
    });

    it('fails to check a session token if the allowed_method is wrong', async () => {
      const email = 'john.smith@tanker.io';
      const verificationCode = await appHelper.getVerificationCode(email);
      const token = await bobLaptop.registerIdentity({ email, verificationCode }, { withSessionToken: true });

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, token, [{
        type: 'oidc_id_token',
      }]);
      expect(response.status).to.eq(401);
    });

    it('fails to check a session token if the token is invalid', async () => {
      const email = 'john.smith@tanker.io';
      const verificationCode = await appHelper.getVerificationCode(email);
      // $FlowIgnore we assert that the token is a string with expect()
      const token = await bobLaptop.registerIdentity({ email, verificationCode }, { withSessionToken: true });
      expect(token).to.be.a('string');
      const badToken = `a${token}`;

      const response = await checkSessionToken(args.appHelper, bobPublicIdentity, badToken, [{
        type: 'email',
        email
      }]);
      expect(response.status).to.eq(400);
    });
  });
};
