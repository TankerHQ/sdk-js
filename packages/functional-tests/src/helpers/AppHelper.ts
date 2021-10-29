import type { b64string } from '@tanker/core';
import { Tanker } from '@tanker/core';
import { ready as cryptoReady, utils } from '@tanker/crypto';
import { getPublicIdentity, createProvisionalIdentity, createIdentity } from '@tanker/identity';
import { expect, uuid } from '@tanker/test-utils';

import { requestManagement, requestTrustchaind } from './request';
import { managementSettings, oidcSettings, storageSettings } from './config';

function toUnpaddedSafeBase64(str: Uint8Array): string {
  const b64 = utils.toSafeBase64(str);
  return b64.substring(0, b64.indexOf('='));
}

export type AppProvisionalUser = {
  target: string;
  value: string;
  identity: string;
  publicIdentity: string;
};

export class AppHelper {
  appId: Uint8Array;
  appSecret: Uint8Array;
  authToken: string;

  constructor(appId: Uint8Array, appSecret: Uint8Array, authToken: string) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.authToken = authToken;
  }

  static async newApp(): Promise<AppHelper> {
    await cryptoReady;
    const body = {
      name: `functest-${uuid.v4()}`,
      environment_name: managementSettings.defaultEnvironmentName,
    };
    const createResponse = await requestManagement({ method: 'POST', path: '/v1/apps', body });
    const authToken = createResponse['app'].auth_token;
    const appId = utils.fromBase64(createResponse['app'].id);
    const appSecret = utils.fromBase64(createResponse['app'].private_signature_key);
    return new AppHelper(appId, appSecret, authToken);
  }

  async _update(body: Record<string, any>): Promise<void> {
    await requestManagement({
      method: 'PATCH',
      path: `/v1/apps/${toUnpaddedSafeBase64(this.appId)}`,
      body,
    });
  }

  async setOIDC() {
    await this._update({
      oidc_provider: 'google',
      oidc_client_id: oidcSettings.googleAuth.clientId,
    });
  }

  async unsetOIDC() {
    await this._update({ oidc_provider: 'none' });
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

  async set2FA(enabled: boolean) {
    await this._update({ session_certificates_enabled: enabled });
  }

  generateIdentity(userId?: string): Promise<b64string> {
    const id = userId || uuid.v4();
    return createIdentity(utils.toBase64(this.appId), utils.toBase64(this.appSecret), id);
  }

  async generateEmailProvisionalIdentity(): Promise<AppProvisionalUser> {
    const email = `${uuid.v4()}@tanker.io`;
    const identity = await createProvisionalIdentity(utils.toBase64(this.appId), 'email', email);
    const publicIdentity = await getPublicIdentity(identity);
    return { target: 'email', value: email, identity, publicIdentity };
  }

  async generatePhoneNumberProvisionalIdentity(): Promise<AppProvisionalUser> {
    const reservedPhoneNumberPrefix = '+3319900'; // Reserved per https://www.arcep.fr/uploads/tx_gsavis/18-0881.pdf 2.5.12
    const phoneNumber = reservedPhoneNumberPrefix + (Math.random() + 1).toString().substr(2, 6);
    const identity = await createProvisionalIdentity(utils.toBase64(this.appId), 'phone_number', phoneNumber);
    const publicIdentity = await getPublicIdentity(identity);
    return { target: 'phone_number', value: phoneNumber, identity, publicIdentity };
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
      auth_token: this.authToken,
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
      auth_token: this.authToken,
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
    return digits.join();
  }

  async cleanup(): Promise<void> {
    await requestManagement({
      method: 'DELETE',
      path: `/v1/apps/${toUnpaddedSafeBase64(this.appId)}`,
    });
  }
}
