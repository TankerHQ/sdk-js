import EventEmitter from 'events';

import { encryptionV2, tcrypto, utils } from '@tanker/crypto';
import { InternalError, InvalidVerification, UpgradeRequired, TankerError } from '@tanker/errors';

import { generateGhostDeviceKeys, extractGhostDevice, ghostDeviceToVerificationKey, ghostDeviceKeysFromVerificationKey, decryptVerificationKey, ghostDeviceToEncryptedVerificationKey, decryptUserKeyForGhostDevice } from './ghostDevice';
import type { ProvisionalUserKeyPairs, IndexedProvisionalUserKeyPairs } from './KeySafe';
import type KeyStore from './KeyStore';
import LocalUser from './LocalUser';
import { formatVerificationRequest } from './requests';
import type {
  VerificationMethod,
  VerificationMethodResponse,
  VerificationWithToken,
  RemoteVerificationWithToken,
  LegacyEmailVerification,
} from './types';
import { generateUserCreation, generateDeviceFromGhostDevice, makeDeviceRevocation } from './UserCreation';
import type { UserData, DelegationToken } from './UserData';

import type { Client, PullOptions } from '../Network/Client';
import { Status } from '../Session/status';
import type { Device } from '../Users/types';
import { makeSessionCertificate } from './SessionCertificate';

export type PrivateProvisionalKeys = {
  appEncryptionKeyPair: tcrypto.SodiumKeyPair;
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair;
};

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
        return Status.IDENTITY_REGISTRATION_NEEDED;
      }

      return Status.IDENTITY_VERIFICATION_NEEDED;
    }

    // Authenticate device in background (no await)
    this._client.authenticateDevice(this._localUser.deviceId, this._localUser.deviceSignatureKeyPair).catch(e => this.emit('error', e));

    return Status.READY;
  };

  getVerificationMethods = async (): Promise<Array<VerificationMethod | LegacyEmailVerification>> => {
    const verificationMethods: VerificationMethodResponse = await this._client.getVerificationMethods();

    if (verificationMethods.length === 0) {
      return [{ type: 'verificationKey' }];
    }

    return verificationMethods.map((method) => {
      switch (method.type) {
        case 'email': {
          // Compat: encrypted_email value might be missing.
          // verification method registered with SDK < 2.0.0 have encrypted_email set to NULL in out database
          if (!method.encrypted_email) {
            return { type: 'email' };
          }

          const encryptedEmail = utils.fromBase64(method.encrypted_email!);
          const email = utils.toString(encryptionV2.decrypt(this._localUser.userSecret, encryptionV2.unserialize(encryptedEmail)));
          return { type: 'email', email };
        }
        case 'passphrase': {
          return { type: 'passphrase' };
        }
        case 'oidc_id_token': {
          return { type: 'oidcIdToken' };
        }
        case 'phone_number': {
          const encryptedPhoneNumber = utils.fromBase64(method.encrypted_phone_number);
          const phoneNumber = utils.toString(encryptionV2.decrypt(this._localUser.userSecret, encryptionV2.unserialize(encryptedPhoneNumber)));
          return { type: 'phoneNumber', phoneNumber };
        }
        default: {
          // @ts-expect-error this code is only reachable in old SDK when new verification are introduced `method`'s type should be `never`
          throw new UpgradeRequired(`unsupported verification method type: ${method.type}`);
        }
      }
    });
  };

  setVerificationMethod = (verification: RemoteVerificationWithToken): Promise<void> => {
    const requestVerification = formatVerificationRequest(verification, this._localUser);
    requestVerification.with_token = verification.withToken; // May be undefined

    return this._client.setVerificationMethod({
      verification: requestVerification,
    });
  };

  updateDeviceInfo = async (id: Uint8Array, encryptionKeyPair: tcrypto.SodiumKeyPair, signatureKeyPair: tcrypto.SodiumKeyPair): Promise<void> => {
    this._localUser.deviceId = id;
    this._localUser.deviceEncryptionKeyPair = encryptionKeyPair;
    this._localUser.deviceSignatureKeyPair = signatureKeyPair;
    await this.updateLocalUser({
      isLight: true,
    });
  };

  createUser = async (verification: VerificationWithToken): Promise<void> => {
    let ghostDeviceKeys;

    if ('verificationKey' in verification) {
      try {
        ghostDeviceKeys = ghostDeviceKeysFromVerificationKey(verification.verificationKey);
      } catch (e) {
        throw new InvalidVerification(e as Error);
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

    if ('email' in verification || 'passphrase' in verification || 'oidcIdToken' in verification || 'phoneNumber' in verification) {
      request.v2_encrypted_verification_key = ghostDeviceToEncryptedVerificationKey(ghostDevice, this._localUser.userSecret);
      request.verification = formatVerificationRequest(verification, this._localUser);
      request.verification.with_token = verification.withToken; // May be undefined
    }

    await this._client.createUser(firstDeviceId, firstDeviceSignatureKeyPair, request);
    await this.updateDeviceInfo(firstDeviceId, firstDeviceEncryptionKeyPair, firstDeviceSignatureKeyPair);
  };

  createNewDevice = async (verification: VerificationWithToken): Promise<void> => {
    try {
      const verificationKey = await this.getVerificationKey(verification);
      const ghostDevice = extractGhostDevice(verificationKey);

      const ghostSignatureKeyPair = tcrypto.getSignatureKeyPairFromPrivateKey(ghostDevice.privateSignatureKey);
      const encryptedUserKey = await this._client.getEncryptionKey(ghostSignatureKeyPair.publicKey);
      const userEncryptionKeyPair = decryptUserKeyForGhostDevice(ghostDevice, encryptedUserKey);

      const { trustchainId, userId } = this._localUser;
      const newDevice = await generateDeviceFromGhostDevice(trustchainId, userId, ghostDevice, encryptedUserKey.deviceId, userEncryptionKeyPair);
      const deviceId = newDevice.hash;
      const deviceSignatureKeyPair = newDevice.signatureKeyPair;
      await this._client.createDevice(deviceId, deviceSignatureKeyPair, { device_creation: newDevice.block });
      await this.updateDeviceInfo(deviceId, newDevice.encryptionKeyPair, deviceSignatureKeyPair);
    } catch (err) {
      const e = err as Error;
      if (e instanceof TankerError) {
        throw e;
      }

      if ('verificationKey' in verification) {
        throw new InvalidVerification(e);
      }

      throw new InternalError(e.toString());
    }
  };

  revokeDevice = async (deviceToRevokeId: Uint8Array): Promise<void> => {
    await this.updateLocalUser({ isLight: false });

    const { payload, nature } = makeDeviceRevocation(this._localUser.devices, this._localUser.currentUserKey, deviceToRevokeId);
    const block = this._localUser.makeBlock(payload, nature);
    await this._client.revokeDevice({ device_revocation: block });
  };

  listDevices = async (): Promise<Array<Device>> => {
    await this.updateLocalUser({ isLight: false });
    const devices = this._localUser.devices;
    return devices.filter(d => !d.isGhostDevice);
  };

  getSessionToken = async (verification: VerificationWithToken): Promise<string> => {
    await this.updateLocalUser({ isLight: true });

    const { payload, nature } = makeSessionCertificate(verification);
    const block = this._localUser.makeBlock(payload, nature);

    if (!verification.withToken)
      throw new InternalError('Assertion error: Cannot get a session certificate without withToken');

    return this._client.getSessionToken({ session_certificate: block, nonce: verification.withToken.nonce });
  };

  findUserKey = async (publicKey: Uint8Array): Promise<tcrypto.SodiumKeyPair | undefined> => {
    const userKey = this._localUser.findUserKey(publicKey);
    if (!userKey) {
      await this.updateLocalUser({ isLight: true });
    }
    return this._localUser.findUserKey(publicKey)!;
  };

  updateLocalUser = async (options: PullOptions = {}) => {
    // To update the local user, we can't just get our user because in light
    // mode, only the first device will be returned. So we pull by device to get
    // at least the first device and our device.
    const { root, histories } = await this._client.getUserHistoriesByDeviceIds([this._localUser.deviceId], options);
    const localUserBlocks = [root, ...histories];
    this._localUser.initializeWithBlocks(localUserBlocks);
    await this._keyStore.save(this._localUser.localData, this._localUser.userSecret);
  };

  get localUser(): LocalUser {
    return this._localUser;
  }

  findProvisionalUserKey = (appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): PrivateProvisionalKeys | null => {
    const id = utils.concatArrays(appPublicSignatureKey, tankerPublicSignatureKey);
    const result = this._provisionalUserKeys[utils.toBase64(id)];
    if (result) {
      const { appEncryptionKeyPair, tankerEncryptionKeyPair } = result;
      return { appEncryptionKeyPair, tankerEncryptionKeyPair };
    }
    return null;
  };

  addProvisionalUserKey = async (appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array, privateProvisionalKeys: PrivateProvisionalKeys): Promise<void> => {
    const id = utils.toBase64(utils.concatArrays(appPublicSignatureKey, tankerPublicSignatureKey));
    this._provisionalUserKeys[id] = {
      id,
      appEncryptionKeyPair: privateProvisionalKeys.appEncryptionKeyPair,
      tankerEncryptionKeyPair: privateProvisionalKeys.tankerEncryptionKeyPair,
    };
    return this._keyStore.saveProvisionalUserKeys(this._provisionalUserKeys, this._localUser.userSecret);
  };

  hasProvisionalUserKey = (appPublicEncryptionKey: Uint8Array): boolean => {
    const puks: Array<ProvisionalUserKeyPairs> = (Object.values(this._provisionalUserKeys) as any);
    return puks.some(puk => utils.equalArray(puk.appEncryptionKeyPair.publicKey, appPublicEncryptionKey));
  };

  generateVerificationKey = async () => {
    const ghostDeviceKeys = generateGhostDeviceKeys();

    return ghostDeviceToVerificationKey({
      privateSignatureKey: ghostDeviceKeys.signatureKeyPair.privateKey,
      privateEncryptionKey: ghostDeviceKeys.encryptionKeyPair.privateKey,
    });
  };

  getVerificationKey = async (verification: VerificationWithToken) => {
    if ('verificationKey' in verification) {
      return verification.verificationKey;
    }
    const remoteVerification: RemoteVerificationWithToken = (verification as any);
    const request = { verification: formatVerificationRequest(remoteVerification, this._localUser) };
    request.verification.with_token = verification.withToken; // May be undefined

    const encryptedVerificationKey = await this._client.getVerificationKey(request);
    return decryptVerificationKey(encryptedVerificationKey, this._localUser.userSecret);
  };
}

export default LocalUserManager;
