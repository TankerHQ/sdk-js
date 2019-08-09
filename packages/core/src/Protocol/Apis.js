// @flow

import Trustchain from '../Trustchain/Trustchain';
import UserAccessor from '../Users/UserAccessor';
import Storage from '../Session/Storage';

import LocalUser from '../Session/LocalUser';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';
import { DataProtector, type Streams } from '../DataProtection/DataProtector';
import DeviceManager from './DeviceManager';
import CloudStorageManager from './CloudStorageManager';


export class Apis {
  userAccessor: UserAccessor;
  groupManager: GroupManager;

  dataProtector: DataProtector;
  deviceManager: DeviceManager;
  cloudStorageManager: CloudStorageManager;

  constructor(localUser: LocalUser, storage: Storage, streams: Streams, trustchain: Trustchain, client: Client) {
    this.userAccessor = new UserAccessor(storage.userStore, trustchain, localUser.trustchainId, localUser.userId);
    this.groupManager = new GroupManager(
      localUser,
      trustchain,
      storage.groupStore,
      this.userAccessor,
      client,
    );

    this.dataProtector = new DataProtector(
      storage.resourceStore,
      client,
      this.groupManager,
      localUser,
      this.userAccessor,
      streams,
    );

    this.deviceManager = new DeviceManager(
      trustchain,
      client,
      localUser,
      storage,
      this.userAccessor,
    );

    this.cloudStorageManager = new CloudStorageManager(
      client,
      this.dataProtector,
      streams,
    );
  }
}
