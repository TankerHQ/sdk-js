import EventEmitter from 'events';

import { TankerError, ExpiredVerification, InternalError, InvalidArgument, InvalidVerification, NetworkError, OperationCanceled, PreconditionFailed, TooManyAttempts } from '@tanker/errors';

import type { DataStoreOptions } from './Storage';
import { Storage } from './Storage';
import type { ClientOptions } from '../Network/Client';
import { Client } from '../Network/Client';
import type { UserData } from '../LocalUser/UserData';
import { Status } from './status';

import { LocalUserManager } from '../LocalUser/Manager';
import { UserManager } from '../Users/Manager';
import { GroupManager } from '../Groups/Manager';
import { CloudStorageManager } from '../CloudStorage/Manager';
import { ProvisionalIdentityManager } from '../ProvisionalIdentity/Manager';
import { ResourceManager } from '../Resources/Manager';
import { DataProtector } from '../DataProtection/DataProtector';
import type { OidcNonceManager } from '../OidcNonce/Manager';
import { SessionManager } from '../TransparentSession/Manager';

export class Session extends EventEmitter {
  _storage: Storage;
  _client: Client;

  _localUserManager: LocalUserManager;
  _userManager: UserManager;
  _groupManager: GroupManager;
  _provisionalIdentityManager: ProvisionalIdentityManager;
  _resourceManager: ResourceManager;
  _sessionManager: SessionManager;
  _dataProtector: DataProtector;
  _cloudStorageManager: CloudStorageManager;

  _status: Status;

  constructor(userData: UserData, storage: Storage, oidcNonceManagerGetter: () => Promise<OidcNonceManager>, client: Client) {
    super();

    this._storage = storage;
    this._client = client;
    this._status = Status.STOPPED;

    this._localUserManager = new LocalUserManager(userData, oidcNonceManagerGetter, client, storage.keyStore);
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
        console.error('Unexpected fatal error caught on the local user manager:', e2 as Error);
        /* noawait */ this.stop(e2 as Error);
      }
    });

    this._userManager = new UserManager(client, this._localUserManager.localUser);
    this._provisionalIdentityManager = new ProvisionalIdentityManager(client, storage.keyStore, this._localUserManager, this._userManager);
    this._groupManager = new GroupManager(client, storage.groupStore, this._localUserManager.localUser, this._userManager, this._provisionalIdentityManager);
    this._resourceManager = new ResourceManager(client, storage.resourceStore, this._localUserManager, this._groupManager, this._provisionalIdentityManager);
    this._sessionManager = new SessionManager(storage.sessionStore);
    this._dataProtector = new DataProtector(client, this._localUserManager.localUser, this._userManager, this._provisionalIdentityManager, this._groupManager, this._resourceManager, this._sessionManager);
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

  static init = async (userData: UserData, oidcNonceManagerGetter: () => Promise<OidcNonceManager>, storeOptions: DataStoreOptions, clientOptions: ClientOptions): Promise<Session> => {
    const client = new Client(userData.trustchainId, userData.userId, clientOptions);

    const storage = new Storage(storeOptions);
    await storage.open(userData.userId, userData.userSecret);

    return new Session(userData, storage, oidcNonceManagerGetter, client);
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

  _wipeDeviceAndStop = async () => {
    await this._client.close();
    await this._storage.nuke();
    this.status = Status.STOPPED;
    this.removeAllListeners();
  };

  _forward = <
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
      await this._handleUnrecoverableError(e);
      throw e;
    }
  };

  _stopIfNotRetryable = async (e: Error) => {
    try {
      const retryableErrors = [ExpiredVerification, InvalidArgument, InvalidVerification, OperationCanceled, PreconditionFailed, TooManyAttempts];
      if (!retryableErrors.some(errClass => e instanceof errClass)) {
        await this.stop();
      }
    } catch (stopError) {
      console.error('Unexpected error while stopping the current session', stopError);
    }

    throw e;
  };

  _promiseChain = <
    F extends (...args: any[]) => Promise<any>,
  >(
    f: F,
    success: () => Awaited<ReturnType<F>>,
    failure: (e: Error) => Promise<never> | never,
  ) => (...args: Parameters<F>) => f(...args).then(success).catch(failure);

  // Getter are used to only access managers after they have been initialized
  _getLocalUserManager = () => this._localUserManager;
  _getCloudStorageManager = () => this._cloudStorageManager;
  _getDataProtector = () => this._dataProtector;
  _getProvisionalIdentityManager = () => this._provisionalIdentityManager;
  _getGroupManager = () => this._groupManager;
  _getUserManager = () => this._userManager;
  _setReady = <T>(arg?: T) => { this.status = Status.READY; return arg; };

  createUser = this._promiseChain(this._forward(this._getLocalUserManager, 'createUser'), this._setReady, this._stopIfNotRetryable);
  createNewDevice = this._promiseChain(this._forward(this._getLocalUserManager, 'createNewDevice'), this._setReady, this._stopIfNotRetryable);

  getVerificationKey = this._forward(this._getLocalUserManager, 'getVerificationKey');
  deviceId = () => this._localUserManager.localUser.deviceId;

  setVerificationMethod = this._forward(this._getLocalUserManager, 'setVerificationMethod');
  getVerificationMethods = this._forward(this._getLocalUserManager, 'getVerificationMethods');
  generateVerificationKey = this._forward(this._getLocalUserManager, 'generateVerificationKey');

  getSessionToken = this._forward(this._getLocalUserManager, 'getSessionToken');

  upload = this._forward(this._getCloudStorageManager, 'upload');
  download = this._forward(this._getCloudStorageManager, 'download') as CloudStorageManager['download'];
  createUploadStream = this._forward(this._getCloudStorageManager, 'createUploadStream');
  createDownloadStream = this._forward(this._getCloudStorageManager, 'createDownloadStream');

  encryptData = this._forward(this._getDataProtector, 'encryptData') as DataProtector['encryptData'];
  decryptData = this._forward(this._getDataProtector, 'decryptData') as DataProtector['decryptData'];
  share = this._forward(this._getDataProtector, 'share');
  createDecryptionStream = this._forward(this._getDataProtector, 'createDecryptionStream');
  createEncryptionStream = this._forward(this._getDataProtector, 'createEncryptionStream');

  attachProvisionalIdentity = this._forward(this._getProvisionalIdentityManager, 'attachProvisionalIdentity');
  verifyProvisionalIdentity = this._forward(this._getProvisionalIdentityManager, 'verifyProvisionalIdentity');

  createGroup = this._forward(this._getGroupManager, 'createGroup');
  updateGroupMembers = this._forward(this._getGroupManager, 'updateGroupMembers');

  findUser = this._forward(this._getUserManager, 'findUser');

  // The `this` in `bind()` is ignored because `_forward()` returns an arrow function
  // `createEncryptionSession()` is always bound to the object instance
  createEncryptionSession = this._forward(this._getDataProtector, 'createEncryptionSession').bind(this, () => this._status);

  _assertUnrecoverableError = async (e: unknown) => {
    const unrecoverableApiCodes = ['invalid_challenge_signature', 'invalid_challenge_public_key', 'device_not_found'];
    if (!(e instanceof InternalError) || !unrecoverableApiCodes.includes(e.apiCode!)) {
      throw e;
    }
  };

  _handleUnrecoverableError = async (e: unknown) => {
    await this._assertUnrecoverableError(e);

    await this._wipeDeviceAndStop();
  };
}
