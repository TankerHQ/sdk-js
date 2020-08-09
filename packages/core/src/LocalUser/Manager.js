// @flow
import EventEmitter from 'events';

import { InternalError, InvalidVerification, TankerError } from '@tanker/errors';
import { utils, tcrypto } from '@tanker/crypto';

import LocalUser from './LocalUser';
import KeyStore from './KeyStore';
import type { ProvisionalUserKeyPairs, IndexedProvisionalUserKeyPairs } from './KeySafe';

import { Client } from '../Network/Client';
import { type Verification, type VerificationMethod, type RemoteVerification } from './types';
import { type UserData, type DelegationToken } from './UserData';
import { type Device } from '../Users/types';
import { statuses, type Status } from '../Session/status';

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
  }

  init = async (): Promise<Status> => {
    if (!this._localUser.isInitialized) {
      // TODO: get user
      const user = null;

      if (user === null) {
        return statuses.IDENTITY_REGISTRATION_NEEDED;
      }

      return statuses.IDENTITY_VERIFICATION_NEEDED;
    }

    // TODO: auth device using this._localUser.deviceId and this._localUser.deviceSignatureKeyPair
    // this.authenticate().catch((e) => this.emit('error', e));

    return statuses.READY;
  }

  getVerificationMethods = (): Promise<Array<VerificationMethod>> => getVerificationMethods(this._client, this._localUser)

  setVerificationMethod = (verification: RemoteVerification): Promise<void> => sendSetVerificationMethod(this._client, this._localUser, verification)

  updateDeviceInfo = async (id: Uint8Array, encryptionKeyPair: tcrypto.SodiumKeyPair, signatureKeyPair: tcrypto.SodiumKeyPair): Promise<void> => {
    this._localUser.deviceId = id;
    this._localUser.deviceEncryptionKeyPair = encryptionKeyPair;
    this._localUser.deviceSignatureKeyPair = signatureKeyPair;

    await this.updateLocalUser();
  }

  createUser = async (verification: Verification): Promise<void> => {
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

    const { trustchainId, userId } = this._localUser;
    const { userCreationBlock, firstDeviceBlock, firstDeviceId, firstDeviceEncryptionKeyPair, firstDeviceSignatureKeyPair, ghostDevice } = generateUserCreation(trustchainId, userId, ghostDeviceKeys, this._delegationToken);
    const encryptedUnlockKey = ghostDeviceToEncryptedUnlockKey(ghostDevice, this._localUser.userSecret);

    // TODO: send user creation with new args (firstDeviceId, firstDeviceSignatureKeyPair)
    // await sendUserCreation(this._client, this._localUser, userCreationBlock, firstDeviceBlock, firstDeviceId, firstDeviceSignatureKeyPair, verification, encryptedUnlockKey);
    await this.updateDeviceInfo(firstDeviceId, firstDeviceEncryptionKeyPair, firstDeviceSignatureKeyPair);
  }

  createNewDevice = async (verification: Verification): Promise<void> => {
    try {
      const unlockKey = await this._getUnlockKey(verification);
      const ghostDevice = extractGhostDevice(unlockKey);

      const { trustchainId, userId } = this._localUser;
      const encryptedUserKey = await getLastUserKey(this._client, trustchainId, ghostDevice);
      const userKey = decryptUserKeyForGhostDevice(ghostDevice, encryptedUserKey);
      const newDevice = await generateDeviceFromGhostDevice(
        trustchainId, userId, ghostDevice, encryptedUserKey.deviceId, userKey
      );
      const deviceId = newDevice.hash;
      const deviceSignatureKeyPair = newDevice.signatureKeyPair;
      // TODO: create device with new args (deviceId, deviceSignatureKeyPair)
      // await this._client.createDevice(deviceId, deviceSignatureKeyPair, { device_creation: newDevice.block });
      await this.updateDeviceInfo(deviceId, newDevice.encryptionKeyPair, deviceSignatureKeyPair);
    } catch (e) {
      if (e instanceof TankerError) {
        throw e;
      }
      if (verification.verificationKey) {
        throw new InvalidVerification(e);
      }
      throw new InternalError(e.toString());
    }
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

  findUserKey = async (publicKey: Uint8Array): Promise<tcrypto.SodiumKeyPair> => {
    const userKey = this._localUser.findUserKey(publicKey);
    if (!userKey) {
      await this.updateLocalUser();
    }
    return this._localUser.findUserKey(publicKey);
  }

  updateLocalUser = async () => {
    const { root, histories } = await this._client.getUserHistoriesByUserIds([this._localUser.userId]);
    const localUserBlocks = [root, ...histories];
    this._localUser.initializeWithBlocks(localUserBlocks);
    await this._keyStore.save(this._localUser.localData, this._localUser.userSecret);
  }

  get localUser(): LocalUser {
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

  addProvisionalUserKey = async (appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array, privateProvisionalKeys: PrivateProvisionalKeys): Promise<void> => {
    const id = utils.toBase64(utils.concatArrays(appPublicSignatureKey, tankerPublicSignatureKey));
    this._provisionalUserKeys[id] = {
      id,
      appEncryptionKeyPair: privateProvisionalKeys.appEncryptionKeyPair,
      tankerEncryptionKeyPair: privateProvisionalKeys.tankerEncryptionKeyPair,
    };
    return this._keyStore.saveProvisionalUserKeys(this._provisionalUserKeys, this._localUser.userSecret);
  }

  hasProvisionalUserKey = (appPublicEncryptionKey: Uint8Array): bool => {
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
