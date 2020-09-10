// @flow
import EventEmitter from 'events';

import { encryptionV2, tcrypto, utils } from '@tanker/crypto';
import { DecryptionFailed, InternalError, InvalidVerification, TankerError } from '@tanker/errors';

import { generateGhostDeviceKeys, extractGhostDevice, ghostDeviceToVerificationKey, ghostDeviceKeysFromVerificationKey, decryptVerificationKey, ghostDeviceToEncryptedVerificationKey, decryptUserKeyForGhostDevice } from './ghostDevice';
import type { ProvisionalUserKeyPairs, IndexedProvisionalUserKeyPairs } from './KeySafe';
import type KeyStore from './KeyStore';
import LocalUser from './LocalUser';
import { formatVerificationRequest } from './requests';
import type { Verification, VerificationMethod, RemoteVerification } from './types';
import { generateUserCreation, generateDeviceFromGhostDevice, makeDeviceRevocation } from './UserCreation';
import type { UserData, DelegationToken } from './UserData';

import type { Client } from '../Network/Client';
import { statuses, type Status } from '../Session/status';
import type { Device } from '../Users/types';

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
      const user = await this._client.getUser();

      if (user === null) {
        return statuses.IDENTITY_REGISTRATION_NEEDED;
      }

      return statuses.IDENTITY_VERIFICATION_NEEDED;
    }

    // Authenticate device in background (no await)
    this._client.authenticateDevice(this._localUser.deviceId, this._localUser.deviceSignatureKeyPair).catch((e) => this.emit('error', e));

    return statuses.READY;
  }

  getVerificationMethods = async (): Promise<Array<VerificationMethod>> => {
    const verificationMethods = await this._client.getVerificationMethods();

    if (verificationMethods.length === 0) {
      return [{ type: 'verificationKey' }];
    }

    return verificationMethods.map(verificationMethod => {
      const method = { ...verificationMethod };

      // Compat: email value might be missing if verification method registered with SDK < 2.0.0
      if (method.type === 'email' && method.encrypted_email) {
        const encryptedEmail = utils.fromBase64(method.encrypted_email);
        if (encryptedEmail.length < encryptionV2.overhead) {
          throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${encryptionV2.overhead} for encryption v2` });
        }
        method.email = utils.toString(encryptionV2.compatDecrypt(this._localUser.userSecret, encryptedEmail));
        delete method.encrypted_email;
      } else if (method.type === 'oidc_id_token') {
        return { type: 'oidcIdToken' };
      }

      return method;
    });
  }

  setVerificationMethod = (verification: RemoteVerification): Promise<void> => this._client.setVerificationMethod({
    verification: formatVerificationRequest(verification, this._localUser),
  });

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
        ghostDeviceKeys = ghostDeviceKeysFromVerificationKey(verification.verificationKey);
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

    const request: any = {
      ghost_device_creation: userCreationBlock,
      first_device_creation: firstDeviceBlock,
    };

    if (verification.email || verification.passphrase || verification.oidcIdToken) {
      request.encrypted_verification_key = ghostDeviceToEncryptedVerificationKey(ghostDevice, this._localUser.userSecret);
      request.verification = formatVerificationRequest(verification, this._localUser);
    }

    await this._client.createUser(firstDeviceId, firstDeviceSignatureKeyPair, request);
    await this.updateDeviceInfo(firstDeviceId, firstDeviceEncryptionKeyPair, firstDeviceSignatureKeyPair);
  }

  createNewDevice = async (verification: Verification): Promise<void> => {
    try {
      const verificationKey = await this._getVerificationKey(verification);
      const ghostDevice = extractGhostDevice(verificationKey);

      const ghostSignatureKeyPair = tcrypto.getSignatureKeyPairFromPrivateKey(ghostDevice.privateSignatureKey);
      const encryptedUserKey = await this._client.getEncryptionKey(ghostSignatureKeyPair.publicKey);
      const userEncryptionKeyPair = decryptUserKeyForGhostDevice(ghostDevice, encryptedUserKey);

      const { trustchainId, userId } = this._localUser;
      const newDevice = await generateDeviceFromGhostDevice(
        trustchainId, userId, ghostDevice, encryptedUserKey.deviceId, userEncryptionKeyPair
      );
      const deviceId = newDevice.hash;
      const deviceSignatureKeyPair = newDevice.signatureKeyPair;
      await this._client.createDevice(deviceId, deviceSignatureKeyPair, { device_creation: newDevice.block });
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

  revokeDevice = async (deviceToRevokeId: Uint8Array): Promise<void> => {
    await this.updateLocalUser();

    const { payload, nature } = makeDeviceRevocation(this._localUser.devices, this._localUser.currentUserKey, deviceToRevokeId);
    const block = this._localUser.makeBlock(payload, nature);
    await this._client.revokeDevice({ device_revocation: block });
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

    return ghostDeviceToVerificationKey({
      privateSignatureKey: ghostDeviceKeys.signatureKeyPair.privateKey,
      privateEncryptionKey: ghostDeviceKeys.encryptionKeyPair.privateKey,
    });
  }

  _getVerificationKey = async (verification: Verification) => {
    if (verification.verificationKey) {
      return verification.verificationKey;
    }
    const remoteVerification: RemoteVerification = (verification: any);
    const request = { verification: formatVerificationRequest(remoteVerification, this._localUser) };
    const encryptedVerificationKey = await this._client.getVerificationKey(request);
    return decryptVerificationKey(encryptedVerificationKey, this._localUser.userSecret);
  }
}

export default LocalUserManager;
