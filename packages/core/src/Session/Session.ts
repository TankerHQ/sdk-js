import EventEmitter from 'events';

import { TankerError, DeviceRevoked, ExpiredVerification, InternalError, InvalidArgument, InvalidVerification, NetworkError, OperationCanceled, PreconditionFailed, TooManyAttempts } from '@tanker/errors';
import type { Data } from '@tanker/types';
import type { b64string } from '@tanker/crypto';

import type { DataStoreOptions } from './Storage';
import Storage from './Storage';
import type { ClientOptions } from '../Network/Client';
import { Client } from '../Network/Client';
import type { UserData } from '../LocalUser/UserData';
import { Status } from './status';

import LocalUserManager from '../LocalUser/Manager';
import UserManager from '../Users/Manager';
import GroupManager from '../Groups/Manager';
import CloudStorageManager from '../CloudStorage/Manager';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';
import ResourceManager from '../Resources/Manager';
import DataProtector from '../DataProtection/DataProtector';

import type { Device } from '../Users/types';
import type { VerificationMethod } from '../LocalUser/types';
import type { AttachResult } from '../ProvisionalIdentity/types';
import type { EncryptionStream } from '../DataProtection/EncryptionStream';
import type { DecryptionStream } from '../DataProtection/DecryptionStream';
import type { UploadStream } from '../CloudStorage/UploadStream';
import type { DownloadStream } from '../CloudStorage/DownloadStream';
import type { EncryptionSession } from '../DataProtection/EncryptionSession';

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

  constructor(userData: UserData, storage: Storage, client: Client) {
    super();

    this._storage = storage;
    this._client = client;
    this._status = Status.STOPPED;

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
        if (!(e2 instanceof DeviceRevoked))
          console.error('Unexpected fatal error caught on the local user manager:', e2 as Error);
        /* noawait */ this.stop(e2 as Error);
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
  };

  start = async (): Promise<void> => {
    try {
      this.status = await this._localUserManager.init();
    } catch (e) {
      await this.stop();
      throw e;
    }
  };

  stop = async (reason?: Error): Promise<void> => {
    await this._client.close(reason);
    await this._storage.close();
    this.status = Status.STOPPED;
    this.removeAllListeners();
  };

  _wipeDeviceAndStop = async (isRevocation: boolean) => {
    await this._client.close();
    await this._storage.nuke();
    this.status = Status.STOPPED;
    if (isRevocation) this.emit('device_revoked');
    this.removeAllListeners();
  };

  createUser = async (...args: any) => {
    await this._forwardAndStopOnFail(this._localUserManager, 'createUser', ...args);
    this.status = Status.READY;
  };

  createNewDevice = async (...args: any) => {
    await this._forwardAndStopOnFail(this._localUserManager, 'createNewDevice', ...args);
    this.status = Status.READY;
  };

  _newForward = <
    Obj extends { [k in Key]: (...args: any) => Promise<any> },
    Key extends string,
    R extends Awaited<ReturnType<Obj[Key]>>,
  >(
    managerGetter: () => Obj,
    func: Key,
  ) => async (...args: Parameters<Obj[Key]>): Promise<R> => {
    const manager = managerGetter();
    try {
      return await manager[func].call(manager, ...args);
    } catch (e) {
      await this._handleUnrecoverableError(e as TankerError);
      throw e as Error;
    }
  };

  // Getter are used to only access managers after they have been initialized
  _getGroupManager = () => this._groupManager;
  _getUserManager = () => this._userManager;

  getVerificationKey = async (...args: any) => this._forward(this._localUserManager, 'getVerificationKey', ...args);
  revokeDevice = (...args: any) => this._forward<void>(this._localUserManager, 'revokeDevice', ...args);
  listDevices = (...args: any) => this._forward<Array<Device>>(this._localUserManager, 'listDevices', ...args);
  deviceId = () => this._localUserManager.localUser.deviceId;

  setVerificationMethod = (...args: any) => this._forward(this._localUserManager, 'setVerificationMethod', ...args);
  getVerificationMethods = (...args: any) => this._forward<Array<VerificationMethod>>(this._localUserManager, 'getVerificationMethods', ...args);
  generateVerificationKey = (...args: any) => this._forward<b64string>(this._localUserManager, 'generateVerificationKey', ...args);

  getSessionToken = async (...args: any) => this._forward<b64string>(this._localUserManager, 'getSessionToken', ...args);

  upload = (...args: any) => this._forward<b64string>(this._cloudStorageManager, 'upload', ...args);
  download = <T extends Data>(...args: any) => this._forward<T>(this._cloudStorageManager, 'download', ...args);
  createUploadStream = (...args: any) => this._forward<UploadStream>(this._cloudStorageManager, 'createUploadStream', ...args);
  createDownloadStream = (...args: any) => this._forward<DownloadStream>(this._cloudStorageManager, 'createDownloadStream', ...args);

  encryptData = <T extends Data>(...args: any) => this._forward<T>(this._dataProtector, 'encryptData', ...args);
  decryptData = <T extends Data>(...args: any) => this._forward<T>(this._dataProtector, 'decryptData', ...args);
  share = (...args: any) => this._forward<void>(this._dataProtector, 'share', ...args);
  createDecryptionStream = (...args: any) => this._forward<DecryptionStream>(this._dataProtector, 'createDecryptionStream', ...args);
  createEncryptionStream = (...args: any) => this._forward<EncryptionStream>(this._dataProtector, 'createEncryptionStream', ...args);

  attachProvisionalIdentity = (...args: any) => this._forward<AttachResult>(this._provisionalIdentityManager, 'attachProvisionalIdentity', ...args);
  verifyProvisionalIdentity = (...args: any) => this._forward<void>(this._provisionalIdentityManager, 'verifyProvisionalIdentity', ...args);

  createGroup = this._newForward(this._getGroupManager, 'createGroup');
  updateGroupMembers = (...args: any) => this._forward<void>(this._groupManager, 'updateGroupMembers', ...args);

  findUser = this._newForward(this._getUserManager, 'findUser');

  createEncryptionSession = (...args: any) => this._forward<EncryptionSession>(this._dataProtector, 'createEncryptionSession', (listener: (status: Status) => void) => {
    this.on('status_change', listener);
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
  };

  _assertUnrecoverableError = async (e: TankerError) => {
    const unrecoverableApiCodes = ['invalid_challenge_signature', 'invalid_challenge_public_key', 'device_not_found'];
    if (!(e instanceof InternalError) || !unrecoverableApiCodes.includes(e.apiCode!)) {
      throw e;
    }
  };

  _handleUnrecoverableError = async (e: TankerError) => {
    if (e instanceof DeviceRevoked) {
      await this._assertRevocation();
    } else {
      await this._assertUnrecoverableError(e);
    }

    await this._wipeDeviceAndStop(e instanceof DeviceRevoked);
  };

  _forward = async <R>(manager: any, func: string, ...args: any) => {
    try {
      return await (manager[func] as any as (...arg: any[]) => Promise<R>).call(manager, ...args);
    } catch (e) {
      await this._handleUnrecoverableError(e as TankerError);
      throw e as Error;
    }
  };

  _forwardAndStopOnFail = async <R>(manager: any, func: string, ...args: any) => {
    try {
      return await this._forward<R>(manager, func, ...args);
    } catch (e) {
      try {
        const retryableErrors = [ExpiredVerification, InvalidArgument, InvalidVerification, OperationCanceled, PreconditionFailed, TooManyAttempts];
        if (!retryableErrors.some(errClass => e instanceof errClass)) {
          await this.stop();
        }
      } catch (stopError) {
        console.error('Unexpected error while stopping the current session', stopError as Error);
      }

      throw e as Error;
    }
  };
}
