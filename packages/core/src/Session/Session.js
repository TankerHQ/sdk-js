// @flow
import EventEmitter from 'events';

import { OperationCanceled, NetworkError, DeviceRevoked, InternalError } from '@tanker/errors';

import Storage, { type DataStoreOptions } from './Storage';
import { Client, type ClientOptions } from '../Network/Client';
import { type Status, statuses } from './LocalUser/types';
import { Managers } from './Managers';
import { type UserData, type DelegationToken } from './LocalUser/UserData';

import { LocalUserManager } from './LocalUser/Manager';

export class Session extends EventEmitter {
  _storage: Storage;
  _client: Client;

  _localUserManager: LocalUserManager;

  _status: Status;
  _delegationToken: ?DelegationToken;

  _managers: Managers;

  constructor(localUserManager: LocalUserManager, storage: Storage, client: Client) {
    super();

    this._storage = storage;
    this._localUserManager = localUserManager;
    this._client = client;
    this._status = statuses.STOPPED;

    this._managers = new Managers(localUserManager, storage, client);
  }

  get status(): Status {
    return this._status;
  }
  set status(status: Status) {
    this._status = status;
  }

  static init = async (userData: UserData, storeOptions: DataStoreOptions, clientOptions: ClientOptions) => {
    const { trustchainId, userId, userSecret } = userData;

    const client = new Client(trustchainId, clientOptions);
    client.open().catch((e) => {
      if (!(e instanceof OperationCanceled) && !(e instanceof NetworkError)) {
        console.error(e);
      }
    });

    const storage = new Storage(storeOptions);
    await storage.open(userId, userSecret);

    const localUserManager = new LocalUserManager(userData, client, storage.keyStore);
    const session = new Session(localUserManager, storage, client);

    localUserManager.on('authentication_failed', session.close);

    session.status = await localUserManager.init();
    return session;
  }

  close = async () => {
    await this._client.close();
    await this._storage.close();
    this._status = statuses.STOPPED;
  }

  nuke = async () => {
    await this._client.close();
    await this._storage.nuke();
    this._status = statuses.STOPPED;
  }

  createUser = async (...args: any) => {
    await this._localUserManager.createUser(...args);
    this._status = statuses.READY;
  }
  createNewDevice = async (...args: any) => {
    await this._localUserManager.createNewDevice(...args);
    this._status = statuses.READY;
  }
  revokeDevice = (...args: any) => this._forward(this._localUserManager, 'revokeDevice', ...args)
  listDevices = (...args: any) => this._forward(this._localUserManager, 'listDevices', ...args)
  deviceId = () => this._localUserManager.localUser.deviceId

  setVerificationMethod = (...args: any) => this._forward(this._localUserManager, 'setVerificationMethod', ...args)
  getVerificationMethods = (...args: any) => this._forward(this._localUserManager, 'getVerificationMethods', ...args)
  generateVerificationKey = (...args: any) => this._forward(this._localUserManager, 'generateVerificationKey', ...args)

  upload = (...args: any) => this._forward(this._managers.cloudStorageManager, 'upload', ...args)
  download = (...args: any) => this._forward(this._managers.cloudStorageManager, 'download', ...args)

  encryptData = (...args: any) => this._forward(this._managers.dataProtector, 'encryptData', ...args)
  decryptData = (...args: any) => this._forward(this._managers.dataProtector, 'decryptData', ...args)
  share = (...args: any) => this._forward(this._managers.dataProtector, 'share', ...args)
  makeDecryptorStream = (...args: any) => this._forward(this._managers.dataProtector, 'makeDecryptorStream', ...args)
  makeEncryptorStream = (...args: any) => this._forward(this._managers.dataProtector, 'makeEncryptorStream', ...args)

  attachProvisionalIdentity = (...args: any) => this._forward(this._managers.provisionalIdentityManager, 'attachProvisionalIdentity', ...args)
  verifyProvisionalIdentity = (...args: any) => this._forward(this._managers.provisionalIdentityManager, 'verifyProvisionalIdentity', ...args)

  createGroup = (...args: any) => this._forward(this._managers.groupManager, 'createGroup', ...args)
  updateGroupMembers = (...args: any) => this._forward(this._managers.groupManager, 'updateGroupMembers', ...args)

  findUser = (...args: any) => this._forward(this._managers.userManager, 'findUser', ...args)

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
