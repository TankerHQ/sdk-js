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
import BlockGenerator from '../Blocks/BlockGenerator';

import { MissingEventHandler, OperationCanceled } from '../errors';
import { Session } from './Session';
import LocalUser from './LocalUser';

export class SessionOpener extends EventEmitter {
  _storage: Storage;
  _trustchain: Trustchain;
  _client: Client;
  _userData: UserData;

  unlocker: Unlocker;
  _blockGenerator: BlockGenerator;
  _unlockInProgress: PromiseWrapper<void>;

  constructor(userData: UserData, storage: Storage, trustchain: Trustchain, client: Client) {
    super();

    this._storage = storage;
    this._trustchain = trustchain;
    this._userData = userData;
    this._client = client;

    this.unlocker = new Unlocker(
      this._userData,
      this._storage.keyStore,
      this._client,
    );

    this._blockGenerator = new BlockGenerator(
      userData.trustchainId,
      this._storage.keyStore.privateSignatureKey,
      new Uint8Array(0), // no deviceId available yet
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
    const newUserBlock = this._blockGenerator.makeNewUserBlock({
      userId: this._userData.userId,
      delegationToken: this._userData.delegationToken,
      publicSignatureKey: this._storage.keyStore.publicSignatureKey,
      publicEncryptionKey: this._storage.keyStore.publicEncryptionKey
    });
    await this._client.sendBlock(newUserBlock);
  }

  _unlockExistingUser = async (allowedToUnlock: bool) => {
    this._unlockInProgress = new PromiseWrapper();
    try {
      const publicSignatureKeySignature = tcrypto.sign(this._storage.keyStore.publicSignatureKey, this._storage.keyStore.privateSignatureKey);
      await this._client.subscribeToCreation(this._storage.keyStore.publicSignatureKey, publicSignatureKeySignature, this._unlockInProgress.resolve);

      if (this._userData.deviceType === DEVICE_TYPE.server_device) {
        // $FlowIKnow that unlockKey is present in userData
        await this.unlocker.unlockWithUnlockKey(this._userData.unlockKey);
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
      const userExists = await this._client.userExists(this._userData.trustchainId, this._userData.userId, this._storage.keyStore.publicSignatureKey);
      if (userExists) {
        await this._unlockExistingUser(allowedToUnlock);
      } else {
        await this._createNewUser();
      }
    }
    const unlockMethods = await this._client.setAuthenticator((challenge: string) => takeChallenge(this._userData, this._storage.keyStore.signatureKeyPair, challenge));
    await this._trustchain.ready();

    if (this._storage.keyStore.wasRevoked) {
      await this._client.close();
      await this._trustchain.close();
      await this._storage.close();

      throw new OperationCanceled('this device was revoked');
    }
    const localUser = new LocalUser(this._userData, unlockMethods, this._storage.keyStore);
    return new Session(localUser, this._storage, this._trustchain, this._client);
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
