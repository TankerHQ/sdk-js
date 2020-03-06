// @flow
import Socket from 'socket.io-client'; // eslint-disable-line import/no-extraneous-dependencies

import type { b64string } from '@tanker/core';
import { hashBlock } from '@tanker/core/src/Blocks/Block';
import { NATURE_KIND, preferredNature } from '@tanker/core/src/Blocks/Nature';
import { serializeBlock } from '@tanker/core/src/Blocks/payloads';
import { random, tcrypto, utils } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';
import { uuid } from '@tanker/test-utils';

let tankerUrl; // eslint-disable-line import/no-mutable-exports
let fakeAuthUrl; // eslint-disable-line import/no-mutable-exports
let idToken; // eslint-disable-line import/no-mutable-exports
let oidcSettings; // eslint-disable-line import/no-mutable-exports
let storageSettings;

const getFakeAuthUrl = (apiUrl) => {
  if (apiUrl.indexOf('api.') !== -1) {
    return apiUrl.replace('api.', 'fakeauth.');
  }
  return 'http://127.0.0.1:4249';
};

// $FlowIKnow
if (process.browser) {
  // $FlowIKnow
  const testConfig = TANKER_TEST_CONFIG; // eslint-disable-line no-undef
  tankerUrl = testConfig.url;
  fakeAuthUrl = getFakeAuthUrl(tankerUrl);
  idToken = testConfig.idToken;
  oidcSettings = testConfig.oidc;
  storageSettings = testConfig.storage;
} else if (process.env.TANKER_CONFIG_FILEPATH && process.env.TANKER_CONFIG_NAME) {
  const fs = require('fs'); // eslint-disable-line global-require

  const config = JSON.parse(fs.readFileSync(process.env.TANKER_CONFIG_FILEPATH, { encoding: 'utf-8' }));
  tankerUrl = config[process.env.TANKER_CONFIG_NAME].url;
  fakeAuthUrl = getFakeAuthUrl(tankerUrl);
  idToken = config[process.env.TANKER_CONFIG_NAME].idToken;
  oidcSettings = config.oidc;
  storageSettings = config.storage;
} else {
  const testConfig = JSON.parse(process.env.TANKER_CI_CONFIG || '');
  tankerUrl = testConfig.url;
  fakeAuthUrl = getFakeAuthUrl(tankerUrl);
  idToken = testConfig.idToken;
  oidcSettings = testConfig.oidc;
  storageSettings = testConfig.storage;
}

export { tankerUrl, fakeAuthUrl, idToken, oidcSettings };

const query = { type: 'admin', context: 'js-functional-tests' };
const socket = new Socket(tankerUrl, { transports: ['websocket', 'polling'], query });

async function send(eventName: string, message: Object | string) {
  const jdata = eventName !== 'push block' ? JSON.stringify(message) : message;
  return new Promise((resolve, reject) => {
    socket.emit(
      eventName, jdata,
      jresult => {
        try {
          const result = JSON.parse(jresult);
          if (result && result.error) {
            reject(new Error(result.error.code));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

class AuthenticatedRequester {
  _reopenPromise: ?Promise<*>;
  _tries: number = 0;

  static open = async () => {
    await send('authenticate customer', { idToken });
    return new AuthenticatedRequester();
  }

  _reopenSession = async () => {
    if (!this._reopenPromise) {
      this._reopenPromise = send('authenticate customer', { idToken });
      await this._reopenPromise;
      this._reopenPromise = null;
    } else {
      await this._reopenPromise;
    }
  }

  send = async (eventName: string, data: ?Object = null): Promise<*> => {
    let ret;
    try {
      ret = await send(eventName, data);
    } catch (e) {
      if (this._tries > 5 || e.message !== 'no_session') {
        throw e;
      }
      this._tries += 1;
      await this._reopenSession();
      return this.send(eventName, data);
    }
    this._tries = 0;
    return ret;
  }
}

export const makePrefix = (length: number = 12) => uuid.v4().replace('-', '').slice(0, length);

// Overcome random()'s max size by generating bigger Uint8Arrays
// having a random segment of 1kB set at a random position.
export const makeRandomUint8Array = (sizeOfData: number) => {
  const sizeOfRandomSegment = 1024; // 1kB

  if (sizeOfData < sizeOfRandomSegment)
    return random(sizeOfData);

  const randomSegment = random(sizeOfRandomSegment);
  const data = new Uint8Array(sizeOfData);
  const randomPos = Math.floor(Math.random() * (sizeOfData - sizeOfRandomSegment));
  data.set(randomSegment, randomPos);
  return data;
};

export function makeRootBlock(appKeyPair: Object) {
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
  _requester: AuthenticatedRequester;
  appId: Uint8Array;
  appKeyPair: Object;
  authToken: string;

  constructor(requester: AuthenticatedRequester, appId: Uint8Array, appKeyPair: Object, authToken: string) {
    this._requester = requester;
    this.appId = appId;
    this.appKeyPair = appKeyPair;
    this.authToken = authToken;
  }

  static async newApp(): Promise<AppHelper> {
    const appKeyPair = tcrypto.makeSignKeyPair();
    const rootBlock = makeRootBlock(appKeyPair);
    const message = {
      root_block: utils.toBase64(serializeBlock(rootBlock)),
      name: `functest-${uuid.v4()}`,
      is_test: true,
      private_signature_key: utils.toBase64(appKeyPair.privateKey),
    };
    const requester = await AuthenticatedRequester.open();
    const createResponse = await requester.send('create trustchain', message);
    const authToken = createResponse.auth_token;
    const appId = rootBlock.trustchain_id;
    return new AppHelper(requester, appId, appKeyPair, authToken);
  }

  async setOIDC() {
    await this._requester.send('update trustchain', {
      id: utils.toBase64(this.appId),
      oidc_provider: 'google',
      oidc_client_id: oidcSettings.googleAuth.clientId,
    });
  }

  async unsetOIDC() {
    await this._requester.send('update trustchain', {
      id: utils.toBase64(this.appId),
      oidc_provider: 'none',
    });
  }

  async setS3() {
    await this._requester.send('update trustchain', {
      id: utils.toBase64(this.appId),
      storage_provider: 's3',
      storage_bucket_name: storageSettings.s3.bucketName,
      storage_bucket_region: storageSettings.s3.bucketRegion,
      storage_client_id: storageSettings.s3.clientId,
      storage_client_secret: storageSettings.s3.clientSecret,
    });
  }

  async unsetS3() {
    await this._requester.send('update trustchain', {
      id: utils.toBase64(this.appId),
      storage_provider: 'none',
    });
  }

  generateIdentity(userId?: string): Promise<b64string> {
    const id = userId || uuid.v4();
    return createIdentity(utils.toBase64(this.appId), utils.toBase64(this.appKeyPair.privateKey), id);
  }

  async getVerificationCode(email: string): Promise<string> {
    const msg = {
      trustchain_id: utils.toBase64(this.appId),
      email,
    };
    const answer = await this._requester.send('get verification code', msg);
    if (!answer.verification_code) {
      throw new Error('Invalid response');
    }
    return answer.verification_code;
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
    await this._requester.send('delete trustchain', { id: utils.toBase64(this.appId) });
  }
}
