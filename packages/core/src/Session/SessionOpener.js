// @flow

import EventEmitter from 'events';
import { tcrypto } from '@tanker/crypto';
import Trustchain from '../Trustchain/Trustchain';
import { PromiseWrapper } from '../PromiseWrapper';
import Storage, { type DataStoreOptions } from './Storage';
import { Unlocker } from '../Unlock/Unlocker';
import { DEVICE_TYPE } from '../Unlock/unlock';

import { type UserData } from '../Tokens/UserData';

import { takeChallenge } from './ClientAuthenticator';
import { Client, type ClientOptions } from '../Network/Client';

import { MissingEventHandler, OperationCanceled } from '../errors';
import { Session } from './Session';
import LocalUser from './LocalUser';
import { type DelegationToken } from './delegation';

export class SessionOpener extends EventEmitter {
  _storage: Storage;
  _trustchain: Trustchain;
  _client: Client;
  _localUser: LocalUser;
  _delegationToken: DelegationToken;

  unlocker: Unlocker;
  _unlockInProgress: PromiseWrapper<void>;

  constructor(userData: UserData, storage: Storage, trustchain: Trustchain, client: Client) {
    super();

    const localUser = new LocalUser(userData, storage.keyStore);
    storage.userStore.setLocalUser(localUser);

    this._storage = storage;
    this._localUser = localUser;
    this._delegationToken = userData.delegationToken;
    this._trustchain = trustchain;
    this._client = client;

    this.unlocker = new Unlocker(
      this._localUser,
      this._client,
    );
  }

  get unlockRequired(): bool {
    return !!this._unlockInProgress;
  }

  static create = async (userData: UserData, storeOptions: DataStoreOptions, clientOptions: ClientOptions) => {
    const client = new Client(userData.trustchainId, clientOptions);
    client.open();
    const storage = new Storage(storeOptions);
    await storage.open(userData.userId, userData.userSecret);

    const trustchain: Trustchain = await Trustchain.open(client, userData.trustchainId, userData.userId, storage);

    return new SessionOpener(userData, storage, trustchain, client);
  }

  _createNewUser = async () => {
    const newUserBlock = this._localUser.blockGenerator.makeNewUserBlock({
      userId: this._localUser.userId,
      delegationToken: this._delegationToken,
      publicSignatureKey: this._localUser.publicSignatureKey,
      publicEncryptionKey: this._localUser.publicEncryptionKey
    });
    await this._client.sendBlock(newUserBlock);
  }

  _unlockExistingUser = async (allowedToUnlock: bool) => {
    this._unlockInProgress = new PromiseWrapper();
    try {
      const publicSignatureKeySignature = tcrypto.sign(this._localUser.publicSignatureKey, this._localUser.privateSignatureKey);
      await this._client.subscribeToCreation(this._localUser.publicSignatureKey, publicSignatureKeySignature, this._unlockInProgress.resolve);

      if (this._localUser.deviceType === DEVICE_TYPE.server_device) {
        // $FlowIKnow that unlockKey is present in userData
        await this.unlocker.unlockWithUnlockKey(this._localUser.unlockKey);
      } else if (!this._unlockInProgress.settled && !allowedToUnlock) {
        throw new MissingEventHandler('unlockRequired');
      } else {
        this.emit('unlockRequired');
      }
      await this._unlockInProgress.promise;
    } finally {
      delete this._unlockInProgress;
    }
  }

  openSession = async (allowedToUnlock: bool): Promise<Session> => {
    if (!this._storage.hasLocalDevice()) {
      const userExists = await this._client.userExists(this._localUser.trustchainId, this._localUser.userId, this._localUser.publicSignatureKey);
      if (userExists) {
        await this._unlockExistingUser(allowedToUnlock);
      } else {
        await this._createNewUser();
      }
    }
    const unlockMethods = await this._client.setAuthenticator((challenge: string) => takeChallenge(this._localUser, this._storage.keyStore.signatureKeyPair, challenge));
    this._localUser.setUnlockMethods(unlockMethods);
    await this._trustchain.ready();

    if (this._localUser.wasRevoked) {
      await this._client.close();
      await this._trustchain.close();
      await this._storage.nuke();

      throw new OperationCanceled('this device was revoked');
    }
    return new Session(this._localUser, this._storage, this._trustchain, this._client);
  };

  cancel = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this._storage.close();

    if (this._unlockInProgress) {
      this._unlockInProgress.reject(new OperationCanceled('Open canceled while unlocking'));
    }
  }
}
