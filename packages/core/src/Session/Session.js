// @flow
import EventEmitter from 'events';
import { InternalError, InvalidVerification, OperationCanceled, NetworkError, TankerError, DeviceRevoked } from '@tanker/errors';

import Storage, { type DataStoreOptions } from './Storage';
import LocalUser from './LocalUser/LocalUser';
import { Client, type ClientOptions } from '../Network/Client';
import { type Status, type Verification, type VerificationMethod, type RemoteVerification, statuses } from './types';
import { Managers } from './Managers';
import { type UserData } from './UserData';

import { sendGetVerificationKey, getLastUserKey, sendUserCreation, getVerificationMethods, sendSetVerificationMethod } from './requests';

import { generateGhostDeviceKeys, extractGhostDevice, ghostDeviceToUnlockKey, ghostDeviceKeysFromUnlockKey, decryptUnlockKey } from './LocalUser/ghostDevice';

export class Session extends EventEmitter {
  localUser: LocalUser;

  storage: Storage;
  _client: Client;

  _status: Status;

  _managers: Managers;

  constructor(localUser: LocalUser, storage: Storage, client: Client, status: Status) {
    super();

    this.storage = storage;
    this.localUser = localUser;
    this._client = client;
    this._status = status;

    client.on('authentication_failed', (e) => this.authenticationError(e));
    this._managers = new Managers(localUser, storage, client);
  }

  get status(): Status {
    return this._status;
  }

  static init = async (userData: UserData, storeOptions: DataStoreOptions, clientOptions: ClientOptions) => {
    const client = new Client(userData.trustchainId, clientOptions);
    client.open().catch((e) => {
      if (!(e instanceof OperationCanceled) && !(e instanceof NetworkError)) {
        console.error(e);
      }
    });

    const storage = new Storage(storeOptions);
    await storage.open(userData.userId, userData.userSecret);

    const localUser = new LocalUser(userData, storage.keyStore);

    if (!storage.hasLocalDevice()) {
      const { deviceExists, userExists } = await client.remoteStatus(localUser.trustchainId, localUser.userId, localUser.publicSignatureKey);

      if (!userExists) {
        return new Session(localUser, storage, client, statuses.IDENTITY_REGISTRATION_NEEDED);
      }

      if (!deviceExists) {
        return new Session(localUser, storage, client, statuses.IDENTITY_VERIFICATION_NEEDED);
      }

      // Device registered on the trustchain, but device creation block not pulled yet...
      // Wait for the pull to catch missing blocks.
      const session = new Session(localUser, storage, client, statuses.STOPPED);
      await session.authenticate();
      return session;
    }

    const session = new Session(localUser, storage, client, statuses.READY);

    session.authenticate().catch((e) => session.authenticationError(e));
    return session;
  }

  authenticate = async () => {
    await this._client.authenticate(this.localUser.userId, this.storage.keyStore.signatureKeyPair);
    if (!this.localUser.isInitialized) {
      await this._updateLocalUser();
    }
    this._status = statuses.READY;
  }

  authenticationError = (e: Error) => {
    // OperationCanceled: thrown if you never managed to authenticate and the session gets closed
    if (!(e instanceof NetworkError) && !(e instanceof OperationCanceled)) {
      console.error(e);
      this.emit('authentication_failed');
    }
  };

  getVerificationMethods = async (): Promise<Array<VerificationMethod>> => getVerificationMethods(this._client, this.localUser)

  setVerificationMethod = async (verification: RemoteVerification): Promise<void> => {
    await sendSetVerificationMethod(this._client, this.localUser, verification);
  }

  createUser = async (verification: Verification) => {
    let ghostDeviceKeys;
    if (verification.verificationKey) {
      try {
        ghostDeviceKeys = ghostDeviceKeysFromUnlockKey(verification.verificationKey);
      } catch (e) {
        throw new InvalidVerification(e);
      }
    } else {
      ghostDeviceKeys = generateGhostDeviceKeys();
    }

    const { userCreationBlock, firstDeviceBlock, encryptedUnlockKey } = this.localUser.generateUserCreation(ghostDeviceKeys);
    await sendUserCreation(this._client, this.localUser, userCreationBlock, firstDeviceBlock, verification, encryptedUnlockKey);
    await this.authenticate();
  }

  unlockUser = async (verification: Verification) => {
    try {
      const unlockKey = await this._getUnlockKey(verification);
      const ghostDevice = extractGhostDevice(unlockKey);

      const encryptedUserKey = await getLastUserKey(this._client, this.localUser.trustchainId, ghostDevice);

      const newDeviceBlock = await this.localUser.generateDeviceFromGhostDevice(ghostDevice, encryptedUserKey);
      await this._client.send('create device', newDeviceBlock, true);
    } catch (e) {
      if (e instanceof TankerError) {
        throw e;
      }
      if (verification.verificationKey) {
        throw new InvalidVerification(e);
      }
      throw new InternalError(e);
    }
    await this.authenticate();
  }


  async revokeDevice(revokedDeviceId: string): Promise<void> {
    await this._updateLocalUser();
    const user = await this._managers.userManager.findUser(this.localUser.userId);
    if (!user)
      throw new InternalError('Cannot find the current user in the users');

    const revokeDeviceBlock = this.localUser.blockGenerator.makeDeviceRevocationBlock(user, this.localUser.currentUserKey, revokedDeviceId);
    await this._client.sendBlock(revokeDeviceBlock);
    await this._updateLocalUser();
  }

  _updateLocalUser = async () => {
    try {
      const localUserBlocks = await this._client.send('get my user blocks');
      await this.localUser.initializeWithBlocks(localUserBlocks);
    } catch (e) {
      if (e instanceof DeviceRevoked) {
        await this._nuke();
        this.emit('device_revoked');
      } else {
        throw e;
      }
    }
  }

  generateVerificationKey = async () => {
    const ghostDeviceKeys = generateGhostDeviceKeys();

    return ghostDeviceToUnlockKey({
      privateSignatureKey: ghostDeviceKeys.signatureKeyPair.privateKey,
      privateEncryptionKey: ghostDeviceKeys.encryptionKeyPair.privateKey,
    });
  }

  close = async () => {
    await this._client.close();
    await this.storage.close();
    this._status = statuses.STOPPED;
  }

  _nuke = async () => {
    await this._client.close();
    await this.storage.nuke();
    this._status = statuses.STOPPED;
  }

  _getUnlockKey = async (verification: Verification) => {
    if (verification.verificationKey) {
      return verification.verificationKey;
    }
    const remoteVerification: RemoteVerification = (verification: any);
    const encryptedUnlockKey = await sendGetVerificationKey(this.localUser, this._client, remoteVerification);
    return decryptUnlockKey(encryptedUnlockKey, this.localUser.userSecret);
  }

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

  _forward = async (manager: any, func: string, ...args: any) => {
    try {
      const res = await manager[func].call(manager, ...args);
      return res;
    } catch (e) {
      if (e instanceof DeviceRevoked) {
        await this._updateLocalUser();
      }
      throw e;
    }
  }
}
