// @flow
import EventEmitter from 'events';

import { InternalError, InvalidVerification, OperationCanceled, NetworkError, TankerError } from '@tanker/errors';
import { utils, tcrypto } from '@tanker/crypto';

import LocalUser from './LocalUser';
import KeyStore from './KeyStore';
import type { ProvisionalUserKeyPairs, IndexedProvisionalUserKeyPairs } from './KeySafe';

import { Client } from '../../Network/Client';
import { type Verification, type VerificationMethod, type RemoteVerification, statuses } from './types';
import { type UserData, type DelegationToken } from './UserData';
import { type Device } from '../../Users/types';

import { generateUserCreation, generateDeviceFromGhostDevice, makeDeviceRevocation } from './UserCreation';

import { sendGetVerificationKey, getLastUserKey, sendUserCreation, getVerificationMethods, sendSetVerificationMethod } from './requests';

import { generateGhostDeviceKeys, extractGhostDevice, ghostDeviceToUnlockKey, ghostDeviceKeysFromUnlockKey, decryptUnlockKey, ghostDeviceToEncryptedUnlockKey, decryptUserKeyForGhostDevice } from './ghostDevice';

export type PrivateProvisionalKeys = {|
  appEncryptionKeyPair: tcrypto.SodiumKeyPair,
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair,
|}

export class LocalUserManager extends EventEmitter {
  _localUser: LocalUser;
  _delegationToken: DelegationToken;
  _provisionalUserKeys: IndexedProvisionalUserKeyPairs;

  _keyStore: KeyStore;
  _client: Client;

  constructor(userData: UserData, client: Client, keyStore: KeyStore) {
    super();

    this._client = client;
    this._keyStore = keyStore;

    const { localData, provisionalUserKeys } = this._keyStore;
    this._localUser = new LocalUser(userData.trustchainId, userData.userId, userData.userSecret, localData);
    this._delegationToken = userData.delegationToken;
    this._provisionalUserKeys = provisionalUserKeys;

    client.on('authentication_failed', (e) => this.authenticationError(e));
  }

  init = async () => {
    if (!this._localUser.isInitialized) {
      const { trustchainId, userId, deviceSignatureKeyPair } = this._localUser;
      const { deviceExists, userExists } = await this._client.remoteStatus(trustchainId, userId, deviceSignatureKeyPair.publicKey);

      if (!userExists) {
        return statuses.IDENTITY_REGISTRATION_NEEDED;
      }

      if (!deviceExists) {
        return statuses.IDENTITY_VERIFICATION_NEEDED;
      }
      await this.authenticate();
      return statuses.READY;
    }

    this.authenticate().catch((e) => this.authenticationError(e));
    return statuses.READY;
  }

  authenticate = async () => {
    await this._client.authenticate(this._localUser.userId, this._localUser.deviceSignatureKeyPair);
    if (!this._localUser.isInitialized) {
      await this.updateLocalUser();
    }
  }

  authenticationError = (e: Error) => {
    // OperationCanceled: thrown if you never managed to authenticate and the session gets closed
    if (!(e instanceof NetworkError) && !(e instanceof OperationCanceled)) {
      console.error(e);
      this.emit('authentication_failed');
    }
  };

  getVerificationMethods = async (): Promise<Array<VerificationMethod>> => getVerificationMethods(this._client, this._localUser)

  setVerificationMethod = async (verification: RemoteVerification): Promise<void> => {
    await sendSetVerificationMethod(this._client, this._localUser, verification);
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

    if (!this._delegationToken) {
      throw new InternalError('Assertion error, no delegation token for user creation');
    }

    const { trustchainId, userId, deviceEncryptionKeyPair, deviceSignatureKeyPair } = this._localUser;
    const { userCreationBlock, firstDeviceBlock, ghostDevice } = generateUserCreation(trustchainId, userId, deviceEncryptionKeyPair, deviceSignatureKeyPair, ghostDeviceKeys, this._delegationToken);
    const encryptedUnlockKey = ghostDeviceToEncryptedUnlockKey(ghostDevice, this._localUser.userSecret);

    await sendUserCreation(this._client, this._localUser, userCreationBlock, firstDeviceBlock, verification, encryptedUnlockKey);
    await this.authenticate();
  }

  createNewDevice = async (verification: Verification) => {
    try {
      const unlockKey = await this._getUnlockKey(verification);
      const ghostDevice = extractGhostDevice(unlockKey);

      const { trustchainId, userId, deviceEncryptionKeyPair, deviceSignatureKeyPair } = this._localUser;
      const encryptedUserKey = await getLastUserKey(this._client, trustchainId, ghostDevice);
      const userKey = decryptUserKeyForGhostDevice(ghostDevice, encryptedUserKey);
      const newDeviceBlock = await generateDeviceFromGhostDevice(
        trustchainId, userId, deviceEncryptionKeyPair, deviceSignatureKeyPair,
        ghostDevice, encryptedUserKey.deviceId, userKey
      );
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
    await this.updateLocalUser();

    const { payload, nature } = makeDeviceRevocation(this._localUser.devices, this._localUser.currentUserKey, utils.fromBase64(revokedDeviceId));
    await this._client.send('push block', this._localUser.makeBlock(payload, nature), true);
  }

  listDevices = async (): Promise<Array<Device>> => {
    await this.updateLocalUser();
    const devices = this._localUser.devices;
    return devices.filter(d => !d.isGhostDevice);
  }

  findUserKey = async (publicKey: Uint8Array) => {
    const userKey = this._localUser.findUserKey(publicKey);
    if (!userKey) {
      await this.updateLocalUser();
    }
    return this._localUser.findUserKey(publicKey);
  }

  updateLocalUser = async () => {
    const localUserBlocks = await this._client.send('get my user blocks');
    this._localUser.initializeWithBlocks(localUserBlocks);
    await this._keyStore.save(this._localUser.localData, this._localUser.userSecret);
  }

  get localUser() {
    return this._localUser;
  }

  findProvisionalUserKey = (appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): ?PrivateProvisionalKeys => {
    const id = utils.concatArrays(appPublicSignatureKey, tankerPublicSignatureKey);
    const result = this._provisionalUserKeys[utils.toBase64(id)];
    if (result) {
      const { appEncryptionKeyPair, tankerEncryptionKeyPair } = result;
      return { appEncryptionKeyPair, tankerEncryptionKeyPair };
    }
    return null;
  }

  addProvisionalUserKey = async (appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array, privateProvisionalKeys: PrivateProvisionalKeys) => {
    const id = utils.toBase64(utils.concatArrays(appPublicSignatureKey, tankerPublicSignatureKey));
    this._provisionalUserKeys[id] = {
      id,
      appEncryptionKeyPair: privateProvisionalKeys.appEncryptionKeyPair,
      tankerEncryptionKeyPair: privateProvisionalKeys.tankerEncryptionKeyPair,
    };
    return this._keyStore.saveProvisionalUserKeys(this._provisionalUserKeys, this._localUser.userSecret);
  }

  hasProvisionalUserKey = (appPublicEncryptionKey: Uint8Array) => {
    const puks: Array<ProvisionalUserKeyPairs> = (Object.values(this._provisionalUserKeys): any);
    return puks.some(puk => utils.equalArray(puk.appEncryptionKeyPair.publicKey, appPublicEncryptionKey));
  }

  generateVerificationKey = async () => {
    const ghostDeviceKeys = generateGhostDeviceKeys();

    return ghostDeviceToUnlockKey({
      privateSignatureKey: ghostDeviceKeys.signatureKeyPair.privateKey,
      privateEncryptionKey: ghostDeviceKeys.encryptionKeyPair.privateKey,
    });
  }

  _getUnlockKey = async (verification: Verification) => {
    if (verification.verificationKey) {
      return verification.verificationKey;
    }
    const remoteVerification: RemoteVerification = (verification: any);
    const encryptedUnlockKey = await sendGetVerificationKey(this._localUser, this._client, remoteVerification);
    return decryptUnlockKey(encryptedUnlockKey, this._localUser.userSecret);
  }
}

export default LocalUserManager;
