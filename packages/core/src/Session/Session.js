// @flow

import Trustchain from '../Trustchain/Trustchain';
import UserAccessor from '../Users/UserAccessor';
import Storage from './Storage';
import { UnlockKeys } from '../Unlock/UnlockKeys';

import { type LocalUser } from '../Session/LocalUser';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';
import BlockGenerator from '../Blocks/BlockGenerator';
import { KeyDecryptor } from '../Resource/KeyDecryptor';
import { ResourceManager } from '../Resource/ResourceManager';
import DataProtector from '../DataProtection/DataProtector';

export class Session {
  localUser: LocalUser;

  storage: Storage;
  _trustchain: Trustchain;
  _client: Client;

  blockGenerator: BlockGenerator;
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

    this.blockGenerator = new BlockGenerator(
      localUser.trustchainId,
      storage.keyStore.privateSignatureKey,
      localUser.deviceId,
    );

    this.userAccessor = new UserAccessor(storage.userStore, trustchain, localUser.trustchainId, localUser.userId);
    this.groupManager = new GroupManager(
      localUser.trustchainId,
      trustchain,
      storage.groupStore,
      this.userAccessor,
      this.blockGenerator,
      client,
    );
    this.unlockKeys = new UnlockKeys(
      this.localUser,
      this.storage.keyStore,
      this._client,
    );

    this.resourceManager = new ResourceManager(
      this.storage.resourceStore,
      this._trustchain,
      new KeyDecryptor(
        this.storage.keyStore,
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
      this.blockGenerator
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

    const revokeDeviceBlock = this.blockGenerator.makeDeviceRevocationBlock(user, this.storage.keyStore.currentUserKey, revokedDeviceId);
    await this._client.sendBlock(revokeDeviceBlock);
    await this._trustchain.sync();
  }
}
