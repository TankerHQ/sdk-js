// @flow

import Trustchain from '../Trustchain/Trustchain';
import UserAccessor from '../Users/UserAccessor';
import Storage from './Storage';
import { UnlockKeys } from '../Unlock/UnlockKeys';

import LocalUser from '../Session/LocalUser';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';
import { KeyDecryptor } from '../Resource/KeyDecryptor';
import { ResourceManager } from '../Resource/ResourceManager';
import DataProtector from '../DataProtection/DataProtector';

export class Session {
  localUser: LocalUser;

  storage: Storage;
  _trustchain: Trustchain;
  _client: Client;

  userAccessor: UserAccessor;
  groupManager: GroupManager;
  unlockKeys: UnlockKeys;

  resourceManager: ResourceManager;
  dataProtector: DataProtector;

  constructor(localUser: LocalUser, storage: Storage, trustchain: Trustchain, client: Client) {
    this.storage = storage;
    this._trustchain = trustchain;
    this.localUser = localUser;
    this._client = client;

    this.userAccessor = new UserAccessor(storage.userStore, trustchain, localUser.trustchainId, localUser.userId);
    this.groupManager = new GroupManager(
      localUser,
      trustchain,
      storage.groupStore,
      this.userAccessor,
      client,
    );

    this.unlockKeys = new UnlockKeys(
      this.localUser,
      this._client,
    );

    this.resourceManager = new ResourceManager(
      this.storage.resourceStore,
      this._trustchain,
      new KeyDecryptor(
        this.localUser,
        this.userAccessor,
        this.storage.groupStore
      )
    );

    this.dataProtector = new DataProtector(
      this.resourceManager,
      this._client,
      this.groupManager,
      this.localUser,
      this.userAccessor,
    );
  }

  get userId(): Uint8Array {
    return this.localUser.userId;
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

  async revokeDevice(revokedDeviceId: string): Promise<void> {
    const user = await this.userAccessor.findUser({ userId: this.localUser.userId });
    if (!user)
      throw new Error('Cannot find the current user in the users');

    const revokeDeviceBlock = this.localUser.blockGenerator.makeDeviceRevocationBlock(user, this.storage.keyStore.currentUserKey, revokedDeviceId);
    await this._client.sendBlock(revokeDeviceBlock);
    await this._trustchain.sync();
  }
}
