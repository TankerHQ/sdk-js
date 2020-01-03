// @flow

import UserManager from '../Users/Manager';
import Storage from './Storage';

import LocalUser from './LocalUser/LocalUser';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';
import { DataProtector } from '../DataProtection/DataProtector';
import CloudStorageManager from '../CloudStorage/CloudStorageManager';
import ProvisionalIdentityManager from './ProvisionalIdentity/ProvisionalIdentityManager';

export class Managers {
  userManager: UserManager;
  groupManager: GroupManager;

  dataProtector: DataProtector;
  cloudStorageManager: CloudStorageManager;
  provisionalIdentityManager: ProvisionalIdentityManager;

  constructor(localUser: LocalUser, storage: Storage, client: Client) {
    this.userManager = new UserManager(client, localUser);
    this.provisionalIdentityManager = new ProvisionalIdentityManager(client, storage.keyStore, localUser, this.userManager);

    this.groupManager = new GroupManager(
      localUser,
      storage.groupStore,
      this.userManager,
      this.provisionalIdentityManager,
      client,
    );

    this.dataProtector = new DataProtector(
      storage.resourceStore,
      client,
      this.groupManager,
      localUser,
      this.userManager,
      this.provisionalIdentityManager
    );

    this.cloudStorageManager = new CloudStorageManager(
      client,
      this.dataProtector,
    );
  }
}
