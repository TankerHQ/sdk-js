// @flow
import EventEmitter from 'events';

import { OperationCanceled, NetworkError, DeviceRevoked, InternalError } from '@tanker/errors';

import Storage, { type DataStoreOptions } from './Storage';
import { Client, type ClientOptions } from '../Network/Client';
import { type UserData, type DelegationToken } from '../LocalUser/UserData';
import { statuses, type Status } from './status';

import LocalUserManager from '../LocalUser/Manager';
import UserManager from '../Users/Manager';
import GroupManager from '../Groups/Manager';
import CloudStorageManager from '../CloudStorage/Manager';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';
import ResourceManager from '../Resources/Manager';
import DataProtector from '../DataProtection/DataProtector';

export class Session extends EventEmitter {
  _storage: Storage;
  _client: Client;

  _localUserManager: LocalUserManager;
  _userManager: UserManager;
  _groupManager: GroupManager;
  _provisionalIdentityManager: ProvisionalIdentityManager;
  _resourceManager: ResourceManager;
  _dataProtector: DataProtector;
  _cloudStorageManager: CloudStorageManager;

  _status: Status;
  _delegationToken: ?DelegationToken;

  constructor(userData: UserData, storage: Storage, client: Client) {
    super();

    this._storage = storage;
    this._client = client;
    this._status = statuses.STOPPED;

    this._client.on('error', (e) => this.onError(e));
    this._client.open().catch((e) => this.onError(e));

    this._localUserManager = new LocalUserManager(userData, client, storage.keyStore);
    this._localUserManager.on('error', (e) => this.onError(e));

    this._userManager = new UserManager(client, this._localUserManager.localUser);
    this._provisionalIdentityManager = new ProvisionalIdentityManager(client, storage.keyStore, this._localUserManager, this._userManager);
    this._groupManager = new GroupManager(client, storage.groupStore, this._localUserManager.localUser, this._userManager, this._provisionalIdentityManager);
    this._resourceManager = new ResourceManager(client, storage.resourceStore, this._localUserManager, this._groupManager, this._provisionalIdentityManager);
    this._dataProtector = new DataProtector(client, this._localUserManager.localUser, this._userManager, this._provisionalIdentityManager, this._groupManager, this._resourceManager);
    this._cloudStorageManager = new CloudStorageManager(client, this._dataProtector);
  }

  get status(): Status {
    return this._status;
  }

  set status(nextStatus: Status) {
    if (nextStatus !== this._status) {
      this._status = nextStatus;
      this.emit('status_change', nextStatus);
    }
  }

  async start(): Promise<void> {
    this.status = await this._localUserManager.init();
  }

  static init = async (userData: UserData, storeOptions: DataStoreOptions, clientOptions: ClientOptions): Promise<Session> => {
    const client = new Client(userData.trustchainId, clientOptions);

    const storage = new Storage(storeOptions);
    await storage.open(userData.userId, userData.userSecret);

    const session = new Session(userData, storage, client);

    try {
      await session.start();
    } catch (e) {
      await client.close();
      await storage.close();
      throw e;
    }

    return session;
  }

  close = async () => {
    await this._client.close();
    await this._storage.close();
    this.status = statuses.STOPPED;
  }

  nuke = async () => {
    await this._client.close();
    await this._storage.nuke();
    this.status = statuses.STOPPED;
  }

  onError = (e: Error) => {
    // OperationCanceled: thrown if you never managed to authenticate and the session gets closed
    if (!(e instanceof NetworkError) && !(e instanceof OperationCanceled)) {
      console.error(e);
      this.emit('fatal_error', e);
    }
  };

  createUser = async (...args: any) => {
    await this._localUserManager.createUser(...args);
    this.status = statuses.READY;
  }
  createNewDevice = async (...args: any) => {
    await this._localUserManager.createNewDevice(...args);
    this.status = statuses.READY;
  }
  revokeDevice = (...args: any) => this._forward(this._localUserManager, 'revokeDevice', ...args)
  listDevices = (...args: any) => this._forward(this._localUserManager, 'listDevices', ...args)
  deviceId = () => this._localUserManager.localUser.deviceId

  setVerificationMethod = (...args: any) => this._forward(this._localUserManager, 'setVerificationMethod', ...args)
  getVerificationMethods = (...args: any) => this._forward(this._localUserManager, 'getVerificationMethods', ...args)
  generateVerificationKey = (...args: any) => this._forward(this._localUserManager, 'generateVerificationKey', ...args)

  upload = (...args: any) => this._forward(this._cloudStorageManager, 'upload', ...args)
  download = (...args: any) => this._forward(this._cloudStorageManager, 'download', ...args)

  encryptData = (...args: any) => this._forward(this._dataProtector, 'encryptData', ...args)
  decryptData = (...args: any) => this._forward(this._dataProtector, 'decryptData', ...args)
  share = (...args: any) => this._forward(this._dataProtector, 'share', ...args)
  makeDecryptorStream = (...args: any) => this._forward(this._dataProtector, 'makeDecryptorStream', ...args)
  makeEncryptorStream = (...args: any) => this._forward(this._dataProtector, 'makeEncryptorStream', ...args)

  attachProvisionalIdentity = (...args: any) => this._forward(this._provisionalIdentityManager, 'attachProvisionalIdentity', ...args)
  verifyProvisionalIdentity = (...args: any) => this._forward(this._provisionalIdentityManager, 'verifyProvisionalIdentity', ...args)

  createGroup = (...args: any) => this._forward(this._groupManager, 'createGroup', ...args)
  updateGroupMembers = (...args: any) => this._forward(this._groupManager, 'updateGroupMembers', ...args)

  findUser = (...args: any) => this._forward(this._userManager, 'findUser', ...args)

  _handleDeviceRevoked = async () => {
    try {
      await this._localUserManager.updateLocalUser();
      throw new InternalError('Assertion error: the server is rejecting us but we are not revoked');
    } catch (e) {
      if (e instanceof DeviceRevoked) {
        await this.nuke();
        this.emit('device_revoked');
      }
      throw e;
    }
  }

  _forward = async (manager: any, func: string, ...args: any) => {
    try {
      const res = await manager[func].call(manager, ...args);
      return res;
    } catch (e) {
      if (e instanceof DeviceRevoked) {
        await this._handleDeviceRevoked();
      }
      throw e;
    }
  }
}
