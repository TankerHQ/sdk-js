// @flow

import Trustchain from '../Trustchain/Trustchain';
import UserAccessor from '../Users/UserAccessor';
import Storage from '../Session/Storage';
import { UnlockKeys } from '../Unlock/UnlockKeys';

import LocalUser from '../Session/LocalUser';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';
import { KeyDecryptor } from '../Resource/KeyDecryptor';
import { ResourceManager } from '../Resource/ResourceManager';
import DataProtector from '../DataProtection/DataProtector';
import DeviceManager from './DeviceManager';


export class Apis {
  userAccessor: UserAccessor;
  groupManager: GroupManager;
  unlockKeys: UnlockKeys;

  resourceManager: ResourceManager;
  dataProtector: DataProtector;
  deviceManager: DeviceManager

  constructor(localUser: LocalUser, storage: Storage, trustchain: Trustchain, client: Client) {
    this.userAccessor = new UserAccessor(storage.userStore, trustchain, localUser.trustchainId, localUser.userId);
    this.groupManager = new GroupManager(
      localUser,
      trustchain,
      storage.groupStore,
      this.userAccessor,
      client,
    );

    this.unlockKeys = new UnlockKeys(
      localUser,
      client,
    );

    this.resourceManager = new ResourceManager(
      storage.resourceStore,
      trustchain,
      new KeyDecryptor(
        localUser,
        this.userAccessor,
        storage.groupStore
      )
    );

    this.dataProtector = new DataProtector(
      this.resourceManager,
      client,
      this.groupManager,
      localUser,
      this.userAccessor,
    );

    this.deviceManager = new DeviceManager(
      trustchain,
      client,
      localUser,
      storage,
      this.userAccessor,
    );
  }
}
