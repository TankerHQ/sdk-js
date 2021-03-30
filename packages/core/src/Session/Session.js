// @flow
import EventEmitter from 'events';

import { TankerError, DeviceRevoked, ExpiredVerification, InternalError, InvalidArgument, InvalidVerification, NetworkError, OperationCanceled, PreconditionFailed, TooManyAttempts } from '@tanker/errors';

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

    this._localUserManager = new LocalUserManager(userData, client, storage.keyStore);
    this._localUserManager.on('error', async (e: Error) => {
      // These are expected errors respectively when no network access and
      // when stopping the session while another API call is in progress.
      if (e instanceof NetworkError || e instanceof OperationCanceled) {
        return;
      }

      try {
        if (e instanceof TankerError)
          await this._handleUnrecoverableError(e);
        throw e;
      } catch (e2) {
        if (!(e instanceof DeviceRevoked))
          console.error('Unexpected fatal error caught on the local user manager:', e2);
        /* noawait */ this.stop();
      }
    });

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

  static init = async (userData: UserData, storeOptions: DataStoreOptions, clientOptions: ClientOptions): Promise<Session> => {
    const client = new Client(userData.trustchainId, userData.userId, clientOptions);

    const storage = new Storage(storeOptions);
    await storage.open(userData.userId, userData.userSecret);

    return new Session(userData, storage, client);
  }

  start = async (): Promise<void> => {
    try {
      this.status = await this._localUserManager.init();
    } catch (e) {
      await this.stop();
      throw e;
    }
  }

  stop = async (): Promise<void> => {
    await this._client.close();
    await this._storage.close();
    this.status = statuses.STOPPED;
    this.removeAllListeners();
  }

  _wipeDeviceAndStop = async (isRevocation: bool) => {
    await this._client.close();
    await this._storage.nuke();
    this.status = statuses.STOPPED;
    if (isRevocation) this.emit('device_revoked');
    this.removeAllListeners();
  }

  createUser = async (...args: any) => {
    await this._forwardAndStopOnFail(this._localUserManager, 'createUser', ...args);
    this.status = statuses.READY;
  }
  createNewDevice = async (...args: any) => {
    await this._forwardAndStopOnFail(this._localUserManager, 'createNewDevice', ...args);
    this.status = statuses.READY;
  }
  getVerificationKey = async (...args: any) => this._forward(this._localUserManager, 'getVerificationKey', ...args)
  revokeDevice = (...args: any) => this._forward(this._localUserManager, 'revokeDevice', ...args)
  listDevices = (...args: any) => this._forward(this._localUserManager, 'listDevices', ...args)
  deviceId = () => this._localUserManager.localUser.deviceId

  setVerificationMethod = (...args: any) => this._forward(this._localUserManager, 'setVerificationMethod', ...args)
  getVerificationMethods = (...args: any) => this._forward(this._localUserManager, 'getVerificationMethods', ...args)
  generateVerificationKey = (...args: any) => this._forward(this._localUserManager, 'generateVerificationKey', ...args)

  getSessionToken = async (...args: any) => this._forward(this._localUserManager, 'getSessionToken', ...args);

  upload = (...args: any) => this._forward(this._cloudStorageManager, 'upload', ...args)
  download = (...args: any) => this._forward(this._cloudStorageManager, 'download', ...args)

  encryptData = (...args: any) => this._forward(this._dataProtector, 'encryptData', ...args)
  decryptData = (...args: any) => this._forward(this._dataProtector, 'decryptData', ...args)
  share = (...args: any) => this._forward(this._dataProtector, 'share', ...args)
  createDecryptionStream = (...args: any) => this._forward(this._dataProtector, 'createDecryptionStream', ...args)
  createEncryptionStream = (...args: any) => this._forward(this._dataProtector, 'createEncryptionStream', ...args)

  attachProvisionalIdentity = (...args: any) => this._forward(this._provisionalIdentityManager, 'attachProvisionalIdentity', ...args)
  verifyProvisionalIdentity = (...args: any) => this._forward(this._provisionalIdentityManager, 'verifyProvisionalIdentity', ...args)

  createGroup = (...args: any) => this._forward(this._groupManager, 'createGroup', ...args)
  updateGroupMembers = (...args: any) => this._forward(this._groupManager, 'updateGroupMembers', ...args)

  findUser = (...args: any) => this._forward(this._userManager, 'findUser', ...args)

  createEncryptionSession = (...args: any) => this._forward(this._dataProtector, 'createEncryptionSession', (l) => {
    this.on('status_change', l);
  }, ...args);

  _assertRevocation = async () => {
    try {
      await this._localUserManager.updateLocalUser({ isLight: true });
      throw new InternalError('The server is rejecting us but we are not revoked');
    } catch (e) {
      // We haven't be able to confirm from the blocks returned by the server that we're actually revoked
      if (!(e instanceof DeviceRevoked)) {
        throw e;
      }
    }
  }

  _assertUnrecoverableError = async (e: TankerError) => {
    const unrecoverableApiCodes = ['invalid_challenge_signature', 'invalid_challenge_public_key', 'device_not_found'];
    if (!(e instanceof InternalError) || !unrecoverableApiCodes.includes(e.apiCode)) {
      throw e;
    }
  }

  _handleUnrecoverableError = async (e: TankerError) => {
    if (e instanceof DeviceRevoked) {
      await this._assertRevocation();
    } else {
      await this._assertUnrecoverableError(e);
    }

    await this._wipeDeviceAndStop(e instanceof DeviceRevoked);
  }

  _forward = async (manager: any, func: string, ...args: any) => {
    try {
      return await manager[func].call(manager, ...args);
    } catch (e) {
      await this._handleUnrecoverableError(e);
      throw e;
    }
  }

  _forwardAndStopOnFail = async (manager: any, func: string, ...args: any) => {
    try {
      return await this._forward(manager, func, ...args);
    } catch (e) {
      try {
        const retryableErrors = [ExpiredVerification, InvalidArgument, InvalidVerification, OperationCanceled, PreconditionFailed, TooManyAttempts];
        if (!retryableErrors.some((errClass) => e instanceof errClass)) {
          await this.stop();
        }
      } catch (stopError) {
        console.error('Unexpected error while stopping the current session', stopError);
      }
      throw e;
    }
  }
}
