// @flow

import UserManager from '../Users/Manager';
import Storage from './Storage';

import GroupManager from '../Groups/Manager';
import LocalUserManager from '../LocalUser/Manager';

import { Client } from '../Network/Client';
import { DataProtector } from '../DataProtection/DataProtector';
import CloudStorageManager from '../CloudStorage/CloudStorageManager';
import ProvisionalIdentityManager from '../ProvisionalIdentity/ProvisionalIdentityManager';

export class Managers {
  userManager: UserManager;
  groupManager: GroupManager;

  dataProtector: DataProtector;
  cloudStorageManager: CloudStorageManager;
  provisionalIdentityManager: ProvisionalIdentityManager;

  constructor(localUserManager: LocalUserManager, storage: Storage, client: Client) {
    this.userManager = new UserManager(client, localUserManager.localUser);
    this.provisionalIdentityManager = new ProvisionalIdentityManager(client, storage.keyStore, localUserManager.localUser, this.userManager);

    this.groupManager = new GroupManager(
      localUserManager.localUser,
      storage.groupStore,
      this.userManager,
      this.provisionalIdentityManager,
      client,
    );

    this.dataProtector = new DataProtector(
      storage.resourceStore,
      client,
      this.groupManager,
      localUserManager,
      this.userManager,
      this.provisionalIdentityManager
    );

    this.cloudStorageManager = new CloudStorageManager(
      client,
      this.dataProtector,
    );
  }
}
