// @flow
import uuid from 'uuid';
import Socket from 'socket.io-client';

import type { TankerInterface, b64string } from '@tanker/core';
import { hashBlock, type Block } from '@tanker/core/src/Blocks/Block';
import { NATURE_KIND, preferredNature } from '@tanker/core/src/Blocks/Nature';
import { serializeBlock } from '@tanker/core/src/Blocks/payloads';
import { random, tcrypto, utils } from '@tanker/crypto';
import { createIdentity, obfuscateUserId } from '@tanker/identity';

const tankerUrl = process.env.TANKER_URL || '';
const idToken = process.env.TANKER_TOKEN || '';

export { tankerUrl, idToken };

const socket = new Socket(tankerUrl, { transports: ['websocket', 'polling'] });

async function sendMessage(eventName: string, message: Object | string) {
  const jdata = eventName !== 'push block' ? JSON.stringify(message) : message;
  return new Promise((resolve, reject) => {
    socket.emit(
      eventName, jdata,
      jresult => {
        try {
          const result = JSON.parse(jresult);
          if (result && result.error) {
            reject(new Error(JSON.stringify(result.error)));
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

export async function syncTankers(...tankers: Array<TankerInterface>): Promise<void> {
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

export function makeRootBlock(trustchainKeyPair: Object) {
  const rootBlock: Block = {
    index: 1,
    trustchain_id: new Uint8Array(0),
    nature: preferredNature(NATURE_KIND.trustchain_creation),
    author: new Uint8Array(32),
    payload: trustchainKeyPair.publicKey,
    signature: new Uint8Array(tcrypto.SIGNATURE_SIZE)
  };

  rootBlock.trustchain_id = hashBlock(rootBlock);

  return rootBlock;
}

export class TrustchainHelper {
  trustchainId: Uint8Array;
  trustchainKeyPair: Object;

  constructor(trustchainId: Uint8Array, trustchainKeyPair: Object) {
    this.trustchainId = trustchainId;
    this.trustchainKeyPair = trustchainKeyPair;
  }

  static async newTrustchain(): Promise<TrustchainHelper> {
    const trustchainKeyPair = tcrypto.makeSignKeyPair();
    const rootBlock = makeRootBlock(trustchainKeyPair);
    const message = {
      root_block: utils.toBase64(serializeBlock(rootBlock)),
      name: `functest-${uuid.v4()}`,
      is_test: true,
    };
    await sendMessage('authenticate customer', { idToken });
    await sendMessage('create trustchain', message);

    const trustchainId = rootBlock.trustchain_id;

    return new TrustchainHelper(trustchainId, trustchainKeyPair);
  }

  generateIdentity(userId?: string): Promise<b64string> {
    const id = userId || uuid.v4();
    return createIdentity(utils.toBase64(this.trustchainId), utils.toBase64(this.trustchainKeyPair.privateKey), id);
  }

  async getVerificationCode(userId: string, email: string): Promise<string> {
    const hashedUserId = obfuscateUserId(this.trustchainId, userId);
    const msg = {
      trustchain_id: utils.toBase64(this.trustchainId),
      email,
      user_id: utils.toBase64(hashedUserId),
    };
    await sendMessage('authenticate customer', { idToken });
    const answer = await sendMessage('get verification code', msg);
    if (!answer.verification_code) {
      throw new Error('Invalid response');
    }
    return answer.verification_code;
  }

  async cleanup(): Promise<void> {
    await this.deleteRemoteTrustchain();
  }

  async deleteRemoteTrustchain(): Promise<void> {
    await sendMessage('authenticate customer', { idToken });
    return sendMessage('delete trustchain', { id: utils.toBase64(this.trustchainId) });
  }
}
