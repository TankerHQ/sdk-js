// @flow

import Trustchain from '../Trustchain/Trustchain';
import UserAccessor from '../Users/UserAccessor';
import Storage from './Storage';

import LocalUser from './LocalUser/LocalUser';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';
import { DataProtector } from '../DataProtection/DataProtector';
import CloudStorageManager from '../CloudStorage/CloudStorageManager';
import ProvisionalIdentityManager from './ProvisionalIdentity/ProvisionalIdentityManager';

export class Managers {
  userAccessor: UserAccessor;
  groupManager: GroupManager;

  dataProtector: DataProtector;
  cloudStorageManager: CloudStorageManager;
  provisionalIdentityManager: ProvisionalIdentityManager;

  constructor(localUser: LocalUser, storage: Storage, trustchain: Trustchain, client: Client) {
    this.userAccessor = new UserAccessor(storage.userStore, trustchain, client, localUser, localUser.trustchainId, localUser.userId);
    this.provisionalIdentityManager = new ProvisionalIdentityManager(client, localUser, this.userAccessor);

    this.groupManager = new GroupManager(
      localUser,
      trustchain,
      storage.groupStore,
      storage.keyStore,
      this.userAccessor,
      this.provisionalIdentityManager,
      client,
    );

    this.dataProtector = new DataProtector(
      storage.resourceStore,
      client,
      this.groupManager,
      localUser,
      this.userAccessor,
      this.provisionalIdentityManager
    );

    this.cloudStorageManager = new CloudStorageManager(
      client,
      this.dataProtector,
    );
  }
}
