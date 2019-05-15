// @flow
import { utils } from '@tanker/crypto';

import Trustchain from '../Trustchain/Trustchain';
import Storage, { type DataStoreOptions } from './Storage';
import LocalUser from './LocalUser';
import { Client, type ClientOptions } from '../Network/Client';
import { takeChallenge } from './ClientAuthenticator';
import { decrypt } from '../DataProtection/Encryptors/v2';
import { OperationCanceled } from '../errors';
import { type UserData, type Status, type Verification, type VerificationMethod, type EmailVerification, type PassphraseVerification, statuses } from './types';
import { Apis } from '../Protocol/Apis';

import { fetchUnlockKey, getLastUserKey, sendUserCreation, sendUnlockUpdate } from './requests';

import { generateGhostDeviceKeys, extractGhostDevice, ghostDeviceToUnlockKey, ghostDeviceKeysFromUnlockKey, ghostDeviceToEncryptedUnlockKey, decryptUnlockKey } from './ghostDevice';
import { generateDeviceFromGhostDevice, generateUserCreation } from './deviceCreation';

export class Session {
  localUser: LocalUser;
  _verificationMethods: Map<string, VerificationMethod>;

  storage: Storage;
  _trustchain: Trustchain;
  _client: Client;

  _status: Status;

  apis: Apis;

  constructor(localUser: LocalUser, storage: Storage, trustchain: Trustchain, client: Client, status: ?Status) {
    this.storage = storage;
    this._trustchain = trustchain;
    this.localUser = localUser;
    this._client = client;
    this._status = status || statuses.STOPPED;
    this._verificationMethods = new Map();

    this.apis = new Apis(localUser, storage, trustchain, client);
  }

  get status(): Status {
    return this._status;
  }

  get verificationMethods(): Map<string, VerificationMethod> {
    return this._verificationMethods;
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

    if (!storage.hasLocalDevice()) {
      const { deviceExists, userExists } = await client.remoteStatus(localUser.trustchainId, localUser.userId, localUser.publicSignatureKey);

      if (!userExists) {
        return new Session(localUser, storage, trustchain, client, statuses.IDENTITY_REGISTRATION_NEEDED);
      }

      if (!deviceExists) {
        return new Session(localUser, storage, trustchain, client, statuses.IDENTITY_VERIFICATION_NEEDED);
      }

      // Device registered on the trustchain, but device creation block not pulled yet...
      // Just start the session normally and wait for the pull to catch missing blocks.
    }

    const session = new Session(localUser, storage, trustchain, client);
    await session.authenticate();
    return session;
  }

  authenticate = async () => {
    const authData = await this._client.setAuthenticator((challenge: string) => takeChallenge(this.localUser, this.storage.keyStore.signatureKeyPair, challenge));

    if (authData.unlock_methods) {
      if (!Array.isArray(authData.unlock_methods))
        throw new Error('Assertion error: invalid response from server');

      this.setVerificationMethods(authData.unlock_methods);
    }

    await this._trustchain.ready();

    if (this.localUser.wasRevoked) {
      await this.nuke();
      throw new OperationCanceled('this device was revoked');
    }
    this._status = statuses.READY;
  }

  setVerificationMethods = (verificationMethods: Array<VerificationMethod>) => {
    verificationMethods.forEach(verificationMethod => {
      // $FlowIssue Flow believes that VerificationMethod is any...
      const method: VerificationMethod = { ...verificationMethod };

      // $FlowExpectedError We receive 'password' instead of 'passphrase' to be backward compatible with SDK < 2.0
      if (method.type === 'password') {
        method.type = 'passphrase';
      }

      if (method.type === 'email') {
        method.email = utils.toString(decrypt(this.localUser.userSecret, utils.fromBase64(method.email)));
      }

      this._verificationMethods.set(method.type, method);
    });
  }

  createUser = async (verification: Verification) => {
    let ghostDeviceKeys;
    if (verification.verificationKey) {
      ghostDeviceKeys = ghostDeviceKeysFromUnlockKey(verification.verificationKey);
    } else {
      ghostDeviceKeys = generateGhostDeviceKeys();
    }

    const userCreation = generateUserCreation(
      this.localUser.trustchainId,
      this.localUser.userId,
      this.localUser.delegationToken,
      ghostDeviceKeys
    );

    const firstDevice = generateDeviceFromGhostDevice(
      this.localUser.trustchainId,
      this.localUser.userId,
      this.localUser.deviceKeys(),
      userCreation.ghostDevice,
      userCreation.encryptedUserKey,
    );

    const encryptedUnlockKey = ghostDeviceToEncryptedUnlockKey(userCreation.ghostDevice, this.localUser.userSecret);

    await sendUserCreation(this._client, this.localUser, userCreation, firstDevice.deviceBlock, verification, encryptedUnlockKey);

    await this.authenticate();
  }

  unlockUser = async (verification: Verification) => {
    let unlockKey;
    if (verification.verificationKey) {
      unlockKey = verification.verificationKey;
    } else {
      const encryptedUnlockKey = await fetchUnlockKey(this.localUser, this._client, verification);
      unlockKey = decryptUnlockKey(encryptedUnlockKey, this.localUser.userSecret);
    }

    const ghostDevice = extractGhostDevice(unlockKey);
    const encryptedUserKey = await getLastUserKey(this._client, this.localUser.trustchainId, ghostDevice);

    const newDevice = generateDeviceFromGhostDevice(
      this.localUser.trustchainId,
      this.localUser.userId,
      this.localUser.deviceKeys(),
      ghostDevice,
      encryptedUserKey,
    );
    await this._client.sendBlock(newDevice.deviceBlock);
    await this.authenticate();
  }

  updateUnlock = async (verification: EmailVerification | PassphraseVerification): Promise<void> => {
    await sendUnlockUpdate(this._client, this.localUser, verification);
    if (verification.passphrase) {
      this._verificationMethods.set('passphrase', { type: 'passphrase' });
    }
    if (verification.email) {
      this._verificationMethods.set('email', { type: 'email', email: verification.email });
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
