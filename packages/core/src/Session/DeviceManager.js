// @flow

import { InternalError } from '@tanker/errors';
import { type SecretProvisionalIdentity } from '@tanker/identity';


import { Client } from '../Network/Client';
import LocalUser from './LocalUser';
import Trustchain from '../Trustchain/Trustchain';
import Storage from './Storage';
import UserAccessor from '../Users/UserAccessor';

export default class DeviceManager {
  _trustchain: Trustchain;
  _client: Client;
  _localUser: LocalUser;
  _storage: Storage;
  _userAccessor: UserAccessor;
  _provisionalIdentity: SecretProvisionalIdentity;

  constructor(
    trustchain: Trustchain,
    client: Client,
    localUser: LocalUser,
    storage: Storage,
    userAccessor: UserAccessor,
  ) {
    this._trustchain = trustchain;
    this._client = client;
    this._storage = storage;
    this._localUser = localUser;
    this._userAccessor = userAccessor;
  }

  async revokeDevice(revokedDeviceId: string): Promise<void> {
    // sync the trustchain to be sure we have all our devices, in case we just
    // added one, or generated an unlock key
    await this._trustchain.sync();
    const user = await this._userAccessor.findUser(this._localUser.userId);
    if (!user)
      throw new InternalError('Cannot find the current user in the users');

    const revokeDeviceBlock = this._localUser.blockGenerator.makeDeviceRevocationBlock(user, this._storage.keyStore.currentUserKey, revokedDeviceId);
    await this._client.sendBlock(revokeDeviceBlock);
    await this._trustchain.sync();
  }
}
