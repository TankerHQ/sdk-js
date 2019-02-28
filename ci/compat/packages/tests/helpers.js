// @flow

import fs from 'fs';
import path from 'path';

import { tankerUrl } from '../../../../packages/functional-tests/src/Helpers';
import { fromBase64, toBase64 } from '../../../../packages/client-node';


const password = 'plop';

class User {
  _tanker: any;
  _id: string;
  _token: string;

  constructor(tanker: any, id: string, token: string) {
    this._tanker = tanker;
    this._id = id;
    this._token = token;
  }

  async open() {
    await this._tanker.open(this._id, this._token);
  }

  async create() {
    await this.open();
    if (!await this._tanker.hasRegisteredUnlockMethods()) {
      await this._tanker.registerUnlock({ password });
    }
  }

  async close() {
    await this._tanker.close();
  }

  async encrypt(message: string, userIds: Array<string>, groupIds: Array<string>) {
    return toBase64(await this._tanker.encrypt(message, { shareWithUsers: userIds, shareWithGroups: groupIds }));
  }

  async decrypt(encryptedData: string) {
    return this._tanker.decrypt(fromBase64(encryptedData));
  }

  async createGroup(ids: Array<string>) {
    return this._tanker.createGroup(ids);
  }

  get id() {
    return this._id;
  }

  get token() {
    return this._token;
  }
}

export function makeUser(Tanker: any, userId: string, userToken: string, trustchainId: string, prefix: string = 'default') {
  const dbPath = path.join('/tmp', `${prefix}${trustchainId.replace(/[/\\]/g, '_')}/`);
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
  }
  const tanker = new Tanker({
    trustchainId,
    url: tankerUrl,
    sdkType: 'test',
    dataStore: {
      dbPath,
    },
  });
  tanker.on('unlockRequired', async () => {
    await tanker.unlockCurrentDevice({ password });
  });
  return new User(tanker, userId, userToken);
}

export function makeCurrentUser(userId: string, userToken: string, trustchainId: string, prefix: string = 'default') {
  const Tanker = require('../../../../packages/client-node').default; // eslint-disable-line global-require
  return makeUser(Tanker, userId, userToken, trustchainId, prefix);
}
