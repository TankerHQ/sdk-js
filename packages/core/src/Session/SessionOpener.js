// @flow

import Trustchain from '../Trustchain/Trustchain';
import Storage, { type DataStoreOptions } from './Storage';
import { Unlocker } from '../Unlock/Unlocker';

import { type UserData } from '../UserData';

import { takeChallenge } from './ClientAuthenticator';
import { Client, type ClientOptions } from '../Network/Client';

import { OperationCanceled, IdentityAlreadyRegistered } from '../errors';
import { Session } from './Session';
import LocalUser from './LocalUser';
import { type DelegationToken } from './delegation';

export const SIGN_IN_RESULT = Object.freeze({
  OK: 1,
  IDENTITY_VERIFICATION_NEEDED: 2,
  IDENTITY_NOT_REGISTERED: 3,
});

export type SignInResult = $Values<typeof SIGN_IN_RESULT>;

export type OpenResult = {|
  signInResult: SignInResult,
  session?: Session,
|};

export const OPEN_MODE = Object.freeze({
  SIGN_UP: 1,
  SIGN_IN: 2,
});

export type OpenMode = $Values<typeof OPEN_MODE>;

export type SignInOptions = {|
  unlockKey?: string,
  verificationCode?: string,
  password?: string,
|};

export class SessionOpener {
  _storage: Storage;
  _trustchain: Trustchain;
  _client: Client;
  _localUser: LocalUser;
  _delegationToken: DelegationToken;

  unlocker: Unlocker;

  constructor(userData: UserData, storage: Storage, trustchain: Trustchain, client: Client) {
    const localUser = new LocalUser(userData, storage.keyStore);
    storage.userStore.setCallbacks({
      deviceCreation: localUser.applyDeviceCreation,
      deviceRevocation: localUser.applyDeviceRevocation,
      claim: localUser.applyProvisionalIdentityClaim,
    });

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

  _unlockExistingUser = async (signInOptions?: SignInOptions): Promise<SignInResult> => {
    if (signInOptions && signInOptions.unlockKey)
      await this.unlocker.unlockWithUnlockKey(signInOptions.unlockKey);
    else if (signInOptions && signInOptions.verificationCode)
      await this.unlocker.unlockWithPassword(null, signInOptions.verificationCode);
    else if (signInOptions && signInOptions.password)
      await this.unlocker.unlockWithPassword(signInOptions.password, null);
    else
      return SIGN_IN_RESULT.IDENTITY_VERIFICATION_NEEDED;
    return SIGN_IN_RESULT.OK;
  }

  openSession = async (openMode: OpenMode, signInOptions?: SignInOptions): Promise<OpenResult> => {
    if (!this._storage.hasLocalDevice()) {
      const userExists = await this._client.userExists(this._localUser.trustchainId, this._localUser.userId, this._localUser.publicSignatureKey);
      if (userExists && openMode === OPEN_MODE.SIGN_UP) {
        throw new IdentityAlreadyRegistered('signUp failed: user already exists');
      } else if (userExists) {
        const result = await this._unlockExistingUser(signInOptions);
        if (result !== SIGN_IN_RESULT.OK) {
          return { signInResult: result };
        }
      } else if (openMode === OPEN_MODE.SIGN_UP) {
        await this._createNewUser();
      } else if (openMode === OPEN_MODE.SIGN_IN) {
        return { signInResult: SIGN_IN_RESULT.IDENTITY_NOT_REGISTERED };
      } else {
        throw new Error('assertion error: invalid open mode');
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
    return { session: new Session(this._localUser, this._storage, this._trustchain, this._client), signInResult: SIGN_IN_RESULT.OK };
  };

  cancel = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this._storage.close();
  }
}
