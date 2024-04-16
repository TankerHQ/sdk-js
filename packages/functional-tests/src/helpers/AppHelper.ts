import type { b64string } from '@tanker/core';
import { Tanker } from '@tanker/core';
import { ready as cryptoReady, utils, randomBase64Token } from '@tanker/crypto';
import { getPublicIdentity, createProvisionalIdentity, createIdentity } from '@tanker/identity';
import { expect, uuid } from '@tanker/test-utils';

import { User } from './User';
import type { TankerFactory } from './Device';
import { requestManagement, requestTrustchaind } from './request';
import { managementSettings, oidcSettings, storageSettings, verificationApiToken } from './config';

export type AppProvisionalUser = {
  target: string;
  value: string;
  identity: string;
  publicIdentity: string;
};

export const provisionalUserTypes = {
  email: 1,
  phoneNumber: 2,
};

export type ProvisionalUserType = number;

export class AppHelper {
  makeTanker: TankerFactory;
  appId: Uint8Array;
  appSecret: Uint8Array;

  constructor(makeTanker: TankerFactory, appId: Uint8Array, appSecret: Uint8Array) {
    this.makeTanker = makeTanker;
    this.appId = appId;
    this.appSecret = appSecret;
  }

  static async newApp(makeTanker: TankerFactory): Promise<AppHelper> {
    await cryptoReady;
    const body = {
      name: `sdk-js-functional-tests-${uuid.v4()}`,
      environment_name: managementSettings.defaultEnvironmentName,
    };
    const createResponse = await requestManagement({ method: 'POST', path: '/v2/apps', body });
    const appId = utils.fromBase64(createResponse['app'].id);
    const appSecret = utils.fromBase64(createResponse['app'].private_signature_key);
    return new AppHelper(makeTanker, appId, appSecret);
  }

  async _update(body: Record<string, unknown>): Promise<unknown> {
    return requestManagement({
      method: 'PATCH',
      path: `/v2/apps/${utils.toRawUrlBase64(this.appId)}`,
      body,
    });
  }

  async setOidc(provider: 'google' | 'pro-sante-bas' | 'pro-sante-bas-no-expiry' | 'fake-oidc' = 'google') {
    const providers = {
      google: oidcSettings.googleAuth.clientId,
      'pro-sante-bas': 'doctolib-dev',
      'pro-sante-bas-no-expiry': 'doctolib-dev',
      'fake-oidc': 'tanker',
    };
    const providersIssuer = {
      google: 'https://accounts.google.com',
      'pro-sante-bas': 'https://auth.bas.psc.esante.gouv.fr/auth/realms/esante-wallet',
      'pro-sante-bas-no-expiry': 'https://auth.bas.psc.esante.gouv.fr/auth/realms/esante-wallet',
      'fake-oidc': `${oidcSettings.fakeOidc.url}/issuer`,
    };

    return this._update({
      oidc_providers: [{
        display_name: provider,
        issuer: providersIssuer[provider],
        client_id: providers[provider],
        ignore_token_expiration: provider === 'pro-sante-bas-no-expiry',
      }],
    }) as Promise<{ app: { oidc_providers: Array<{ id: string, display_name: string }> } }>;
  }

  async unsetOidc() {
    await this._update({
      oidc_providers: [],
      oidc_providers_allow_delete: true,
    });
  }

  async setS3() {
    await this._update({
      storage_provider: 's3',
      storage_bucket_name: storageSettings.s3.bucketName,
      storage_bucket_region: storageSettings.s3.bucketRegion,
      storage_client_id: storageSettings.s3.clientId,
      storage_client_secret: storageSettings.s3.clientSecret,
    });
  }

  async unsetS3() {
    await this._update({ storage_provider: 'none' });
  }

  async setEnrollUsersEnabled() {
    await this._update({ enroll_users_enabled: true });
  }

  generateIdentity(userId?: string): Promise<b64string> {
    const id = userId || uuid.v4();
    return createIdentity(utils.toBase64(this.appId), utils.toBase64(this.appSecret), id);
  }

  async makeUser(): Promise<User> {
    return User.create(this.makeTanker, utils.toBase64(this.appId), utils.toBase64(this.appSecret));
  }

  async generateProvisionalUser(type: ProvisionalUserType): Promise<AppProvisionalUser> {
    switch (type) {
      case provisionalUserTypes.email: return this.generateEmailProvisionalIdentity();
      case provisionalUserTypes.phoneNumber: return this.generatePhoneNumberProvisionalIdentity();
      default: throw new Error(`unknown provisional user type: ${type}`);
    }
  }

  async generateEmailProvisionalIdentity(emailParam?: string): Promise<AppProvisionalUser> {
    const email = emailParam || `${uuid.v4()}@tanker.io`;
    const identity = await createProvisionalIdentity(utils.toBase64(this.appId), 'email', email);
    const publicIdentity = await getPublicIdentity(identity);
    return { target: 'email', value: email, identity, publicIdentity };
  }

  async generatePhoneNumberProvisionalIdentity(phoneNumberParam?: string): Promise<AppProvisionalUser> {
    const reservedPhoneNumberPrefix = '+3319900'; // Reserved per https://www.arcep.fr/uploads/tx_gsavis/18-0881.pdf 2.5.12
    const phoneNumber = phoneNumberParam || reservedPhoneNumberPrefix + (Math.random() + 1).toString().substr(2, 6);
    const identity = await createProvisionalIdentity(utils.toBase64(this.appId), 'phone_number', phoneNumber);
    const publicIdentity = await getPublicIdentity(identity);
    return { target: 'phone_number', value: phoneNumber, identity, publicIdentity };
  }

  attachVerifyProvisionalIdentity(session: Tanker, provisional: AppProvisionalUser): Promise<void> {
    switch (provisional.target) {
      case 'email': return this.attachVerifyEmailProvisionalIdentity(session, provisional);
      case 'phone_number': return this.attachVerifyPhoneNumberProvisionalIdentity(session, provisional);
      default: throw new Error(`Unknown provisional identity target: ${provisional.target}`);
    }
  }

  async attachVerifyEmailProvisionalIdentity(session: Tanker, provisional: AppProvisionalUser) {
    const attachResult = await session.attachProvisionalIdentity(provisional.identity);
    expect(attachResult).to.deep.equal({
      status: Tanker.statuses.IDENTITY_VERIFICATION_NEEDED,
      verificationMethod: { type: 'email', email: provisional.value },
    });
    const verificationCode = await this.getEmailVerificationCode(provisional.value);
    await session.verifyProvisionalIdentity({ email: provisional.value, verificationCode });
  }

  async attachVerifyPhoneNumberProvisionalIdentity(session: Tanker, provisional: AppProvisionalUser) {
    const attachResult = await session.attachProvisionalIdentity(provisional.identity);
    expect(attachResult).to.deep.equal({
      status: Tanker.statuses.IDENTITY_VERIFICATION_NEEDED,
      verificationMethod: { type: 'phoneNumber', phoneNumber: provisional.value },
    });
    const verificationCode = await this.getSMSVerificationCode(provisional.value);
    await session.verifyProvisionalIdentity({ phoneNumber: provisional.value, verificationCode });
  }

  async getEmailVerificationCode(email: string): Promise<string> {
    const path = '/verification/email/code';
    const body = {
      app_id: utils.toBase64(this.appId),
      auth_token: verificationApiToken,
      email,
    };
    const { verification_code: verificationCode } = await requestTrustchaind({ method: 'POST', path, body });

    if (!verificationCode) {
      throw new Error('Invalid response');
    }

    return verificationCode;
  }

  async getSMSVerificationCode(phoneNumber: string): Promise<string> {
    const path = '/verification/sms/code';
    const body = {
      app_id: utils.toBase64(this.appId),
      auth_token: verificationApiToken,
      phone_number: phoneNumber,
    };
    const { verification_code: verificationCode } = await requestTrustchaind({ method: 'POST', path, body });

    if (!verificationCode) {
      throw new Error('Invalid response');
    }

    return verificationCode;
  }

  async getWrongEmailVerificationCode(email: string): Promise<string> {
    const code: string = await this.getEmailVerificationCode(email);
    return this.corruptVerificationCode(code);
  }

  async getWrongSMSVerificationCode(phoneNumber: string): Promise<string> {
    const code: string = await this.getSMSVerificationCode(phoneNumber);
    return this.corruptVerificationCode(code);
  }

  async corruptVerificationCode(code: string): Promise<string> {
    const digits: Array<string> = code.split('');
    const wrongDigitIndex = Math.floor(Math.random() * digits.length);
    const wrongDigit = (parseInt(code[wrongDigitIndex]!, 10) + 1) % 10;
    digits[wrongDigitIndex] = `${wrongDigit}`;
    return digits.join('');
  }

  async cleanup(): Promise<void> {
    await requestManagement({
      method: 'DELETE',
      path: `/v2/apps/${utils.toRawUrlBase64(this.appId)}`,
    });
  }

  async generateRandomEmail(): Promise<string> {
    return `${randomBase64Token()}@doctolib.com`;
  }

  // We only generate fictitious phone numbers to avoid accidental sendings to real people:
  //   - Rules for fictitious phone numbers: https://en.wikipedia.org/wiki/Fictitious_telephone_number#France
  //   - Rules for french valid mobile phone numbers: https://github.com/google/libphonenumber/blob/922efffc/resources/PhoneNumberMetadata.xml#L10072-L10088
  async generateRandomPhoneNumber(): Promise<string> {
    return `+3363998${Math.floor(1000 + Math.random() * 9000)}`;
  }
}
