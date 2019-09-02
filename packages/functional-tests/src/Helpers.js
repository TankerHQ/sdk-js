// @flow
import Socket from 'socket.io-client';

import type { Tanker, b64string } from '@tanker/core';
import { hashBlock, type Block } from '@tanker/core/src/Blocks/Block';
import { NATURE_KIND, preferredNature } from '@tanker/core/src/Blocks/Nature';
import { serializeBlock } from '@tanker/core/src/Blocks/payloads';
import { random, tcrypto, utils } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';
import { uuid } from '@tanker/test-utils';

const tankerUrl = process.env.TANKER_URL || '';
const idToken = process.env.TANKER_TOKEN || '';

export { tankerUrl, idToken };

const socket = new Socket(tankerUrl, { transports: ['websocket', 'polling'] });

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

export async function syncTankers(...tankers: Array<Tanker>): Promise<void> {
  await Promise.all(tankers.map(t => t._session._trustchain && t._session._trustchain.ready())); // eslint-disable-line no-underscore-dangle
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
  const rootBlock: Block = {
    index: 1,
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

  constructor(requester: AuthenticatedRequester, appId: Uint8Array, appKeyPair: Object) {
    this._requester = requester;
    this.appId = appId;
    this.appKeyPair = appKeyPair;
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
    await requester.send('create trustchain', message);

    const appId = rootBlock.trustchain_id;

    return new AppHelper(requester, appId, appKeyPair);
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
