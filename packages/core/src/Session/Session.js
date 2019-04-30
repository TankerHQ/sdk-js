// @flow

import Trustchain from '../Trustchain/Trustchain';
import Storage from './Storage';
import LocalUser from './LocalUser';
import { Client } from '../Network/Client';

import { Apis } from '../Protocol/Apis';

export class Session {
  localUser: LocalUser;

  storage: Storage;
  _trustchain: Trustchain;
  _client: Client;

  apis: Apis;

  constructor(localUser: LocalUser, storage: Storage, trustchain: Trustchain, client: Client) {
    this.storage = storage;
    this._trustchain = trustchain;
    this.localUser = localUser;
    this._client = client;

    this.apis = new Apis(localUser, storage, trustchain, client);
  }

  close = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this.storage.close();
  }

  nuke = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this.storage.nuke();
  }
}
