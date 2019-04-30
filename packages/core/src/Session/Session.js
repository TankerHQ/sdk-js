// @flow

import Trustchain from '../Trustchain/Trustchain';
import Storage, { type DataStoreOptions } from './Storage';
import LocalUser from './LocalUser';
import { Client, type ClientOptions } from '../Network/Client';
import { takeChallenge } from './ClientAuthenticator';
import { OperationCanceled, IdentityAlreadyRegistered } from '../errors';
import { type DelegationToken, type UserData } from './types';
import { Apis } from '../Protocol/Apis';

import { fetchUnlockKey, getLastUserKey } from './requests';
import { extractGhostDevice, createDeviceBlockFromGhostDevice } from './unlock';

export type SignInOptions = {|
  unlockKey?: string,
  verificationCode?: string,
  password?: string,
|};

export const SIGN_IN_RESULT = Object.freeze({
  OK: 1,
  IDENTITY_VERIFICATION_NEEDED: 2,
  IDENTITY_NOT_REGISTERED: 3,
});

export type SignInResult = $Values<typeof SIGN_IN_RESULT>;

export class Session {
  localUser: LocalUser;

  storage: Storage;
  _trustchain: Trustchain;
  _client: Client;

  apis: Apis;

  constructor(localUser: LocalUser, storage: Storage, trustchain: Trustchain, client: Client) {
    this.storage = storage;
    this._trustchain = trustchain;
    this.localUser = localUser;
    this._client = client;

    this.apis = new Apis(localUser, storage, trustchain, client);
  }

  static init = async (userData: UserData, storeOptions: DataStoreOptions, clientOptions: ClientOptions) => {
    const client = new Client(userData.trustchainId, clientOptions);
    client.open();
    const storage = new Storage(storeOptions);
    await storage.open(userData.userId, userData.userSecret);

    const localUser = new LocalUser(userData, storage.keyStore);
    storage.userStore.setCallbacks({
      deviceCreation: localUser.applyDeviceCreation,
      deviceRevocation: localUser.applyDeviceRevocation,
      claim: localUser.applyProvisionalIdentityClaim,
    });

    const trustchain = await Trustchain.open(client, userData.trustchainId, userData.userId, storage);

    return new Session(localUser, storage, trustchain, client);
  }

  signIn = async (signInOptions: ?SignInOptions) => {
    if (!this.storage.hasLocalDevice()) {
      const userExists = await this._client.userExists(this.localUser.trustchainId, this.localUser.userId, this.localUser.publicSignatureKey);
      if (!userExists) {
        return SIGN_IN_RESULT.IDENTITY_NOT_REGISTERED;
      } else if (!signInOptions) {
        return SIGN_IN_RESULT.IDENTITY_VERIFICATION_NEEDED;
      }
      await this._unlockExistingUser(signInOptions);
    }

    await this._authenticate();

    if (this.localUser.wasRevoked) {
      await this._client.close();
      await this._trustchain.close();
      await this.storage.nuke();

      throw new OperationCanceled('this device was revoked');
    }
    return SIGN_IN_RESULT.OK;
  }

  signUp = async (delegationToken: DelegationToken) => {
    if (this.storage.hasLocalDevice() || await this._client.userExists(this.localUser.trustchainId, this.localUser.userId, this.localUser.publicSignatureKey)) {
      throw new IdentityAlreadyRegistered('This identity has already been registered');
    }
    const newUserBlock = this.localUser.blockGenerator.makeNewUserBlock({
      userId: this.localUser.userId,
      delegationToken,
      publicSignatureKey: this.localUser.publicSignatureKey,
      publicEncryptionKey: this.localUser.publicEncryptionKey
    });
    await this._client.sendBlock(newUserBlock);

    await this._authenticate();
    return SIGN_IN_RESULT.OK;
  };

  _authenticate = async () => {
    const unlockMethods = await this._client.setAuthenticator((challenge: string) => takeChallenge(this.localUser, this.storage.keyStore.signatureKeyPair, challenge));
    this.localUser.setUnlockMethods(unlockMethods);
    await this._trustchain.ready();
  }

  _unlockExistingUser = async (signInOptions: SignInOptions) => {
    let unlockKey = signInOptions.unlockKey;
    if (!unlockKey) {
      unlockKey = await fetchUnlockKey(this.localUser, this._client, signInOptions.password, signInOptions.verificationCode);
    }
    const ghostDevice = extractGhostDevice(unlockKey);
    const userKey = await getLastUserKey(this._client, this.localUser.trustchainId, ghostDevice.deviceId);

    const newDeviceBlock = createDeviceBlockFromGhostDevice(
      this.localUser.trustchainId,
      this.localUser.userId,
      this.localUser.deviceKeys(),
      ghostDevice,
      userKey,
    );
    await this._client.sendBlock(newDeviceBlock);
  }

  close = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this.storage.close();
  }

  nuke = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this.storage.nuke();
  }
}
