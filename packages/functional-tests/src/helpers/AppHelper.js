// @flow
import type { b64string } from '@tanker/core';
import { hashBlock } from '@tanker/core/src/Blocks/Block';
import { NATURE_KIND, preferredNature } from '@tanker/core/src/Blocks/Nature';
import { serializeBlock } from '@tanker/core/src/Blocks/payloads';
import { tcrypto, utils } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';
import { uuid } from '@tanker/test-utils';

import { requestAppd, requestAdmindWithAuth } from './request';
import { oidcSettings, storageSettings } from './config';

function toUnpaddedSafeBase64(str: Uint8Array): string {
  const b64 = utils.toSafeBase64(str);
  return b64.substring(0, b64.indexOf('='));
}

function makeRootBlock(appKeyPair: Object) {
  const rootBlock = {
    trustchain_id: new Uint8Array(0),
    nature: preferredNature(NATURE_KIND.trustchain_creation),
    author: new Uint8Array(32),
    payload: appKeyPair.publicKey,
    signature: new Uint8Array(tcrypto.SIGNATURE_SIZE)
  };

  rootBlock.trustchain_id = hashBlock(rootBlock);

  return rootBlock;
}

export class AppHelper {
  appId: Uint8Array;
  appKeyPair: Object;
  authToken: string;

  constructor(appId: Uint8Array, appKeyPair: Object, authToken: string) {
    this.appId = appId;
    this.appKeyPair = appKeyPair;
    this.authToken = authToken;
  }

  static async newApp(): Promise<AppHelper> {
    const appKeyPair = tcrypto.makeSignKeyPair();
    const rootBlock = makeRootBlock(appKeyPair);

    const { environments } = await requestAdmindWithAuth({ method: 'GET', path: '/environments' });
    if (environments.length === 0) {
      throw new Error('Assertion error in functional-tests helper: no environment available');
    }

    const body = {
      root_block: utils.toBase64(serializeBlock(rootBlock)),
      name: `functest-${uuid.v4()}`,
      private_signature_key: utils.toBase64(appKeyPair.privateKey),
      environment_id: environments[0].id,
    };
    const createResponse = await requestAdmindWithAuth({ method: 'POST', path: '/apps', body });
    const authToken = createResponse.app.auth_token;
    const appId = rootBlock.trustchain_id;
    return new AppHelper(appId, appKeyPair, authToken);
  }

  async _update(body: Object): Promise<Object> {
    await requestAdmindWithAuth({
      method: 'PATCH',
      path: `/apps/${toUnpaddedSafeBase64(this.appId)}`,
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
    return createIdentity(utils.toBase64(this.appId), utils.toBase64(this.appKeyPair.privateKey), id);
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
    await requestAdmindWithAuth({
      method: 'DELETE',
      path: `/apps/${toUnpaddedSafeBase64(this.appId)}`
    });
  }
}
