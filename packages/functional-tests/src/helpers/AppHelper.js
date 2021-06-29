// @flow
import type { b64string } from '@tanker/core';
import { ready as cryptoReady, utils } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';
import { uuid } from '@tanker/test-utils';

import { requestAppd, requestManagement } from './request';
import { managementSettings, oidcSettings, storageSettings } from './config';

function toUnpaddedSafeBase64(str: Uint8Array): string {
  const b64 = utils.toSafeBase64(str);
  return b64.substring(0, b64.indexOf('='));
}

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
    const authToken = createResponse.app.auth_token;
    const appId = utils.fromBase64(createResponse.app.id);
    const appSecret = utils.fromBase64(createResponse.app.private_signature_key);
    return new AppHelper(appId, appSecret, authToken);
  }

  async _update(body: Object): Promise<Object> {
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

  async set2FA() {
    await this._update({ session_certificates_enabled: true });
  }

  generateIdentity(userId?: string): Promise<b64string> {
    const id = userId || uuid.v4();
    return createIdentity(utils.toBase64(this.appId), utils.toBase64(this.appSecret), id);
  }

  async getVerificationCode(email: string): Promise<string> {
    const path = `/v2/apps/${toUnpaddedSafeBase64(this.appId)}/verification/email/code?email=${encodeURIComponent(email)}`;
    const headers = { Authorization: `Bearer ${this.authToken}` };
    const { verification_code: verificationCode } = await requestAppd({ method: 'GET', path, headers });
    if (!verificationCode) {
      throw new Error('Invalid response');
    }
    return verificationCode;
  }

  async getWrongVerificationCode(email: string): Promise<string> {
    const code: string = await this.getVerificationCode(email);
    const digits: Array<string> = code.split('');
    const wrongDigitIndex = Math.floor(Math.random() * digits.length);
    const wrongDigit = (parseInt(code[wrongDigitIndex], 10) + 1) % 10;
    digits[wrongDigitIndex] = `${wrongDigit}`;
    return digits.join();
  }

  async cleanup(): Promise<void> {
    await requestManagement({
      method: 'DELETE',
      path: `/v1/apps/${toUnpaddedSafeBase64(this.appId)}`
    });
  }
}
