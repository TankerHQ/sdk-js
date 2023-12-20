import EventEmitter from 'events';

import { EncryptionV2, tcrypto, utils } from '@tanker/crypto';
import { InternalError, InvalidVerification, UpgradeRequired, TankerError, InvalidArgument } from '@tanker/errors';

import {
  generateGhostDeviceKeys,
  extractGhostDevice,
  ghostDeviceToVerificationKey,
  ghostDeviceKeysFromVerificationKey,
  decryptVerificationKey,
  ghostDeviceToEncryptedVerificationKey,
  decryptUserKeyForGhostDevice,
  encryptVerificationKeyBytes,
  decryptVerificationKeyBytes,
} from './ghostDevice';
import type { IndexedProvisionalUserKeyPairs } from './KeySafe';
import type { KeyStore } from './KeyStore';
import { LocalUser } from './LocalUser';
import {
  formatVerificationRequest,
  isPreverifiedVerificationRequest,
  formatVerificationsRequest,
  type SetVerificationMethodRequest,
} from './requests';
import type {
  VerificationMethod,
  VerificationWithToken,
  PreverifiedVerification,
  RemoteVerificationWithToken,
  LegacyEmailVerificationMethod,
} from './types';
import { isE2eVerification } from './types';
import { generateUserCreation, generateDeviceFromGhostDevice, generateGhostDevice } from './UserCreation';
import type { UserData, DelegationToken } from './UserData';

import type { Client } from '../Network/Client';
import { OidcNonceManager } from '../OidcNonce/Manager';
import { Status } from '../Session/status';
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
  _oidcNonceManagerGetter: () => Promise<OidcNonceManager>;

  constructor(userData: UserData, oidcNonceManagerGetter: () => Promise<OidcNonceManager>, client: Client, keyStore: KeyStore) {
    super();
    this._client = client;
    this._keyStore = keyStore;
    const { localData, provisionalUserKeys } = this._keyStore;
    this._localUser = new LocalUser(userData.trustchainId, userData.userId, userData.userSecret, localData);
    this._delegationToken = userData.delegationToken;
    this._provisionalUserKeys = provisionalUserKeys;
    this._oidcNonceManagerGetter = oidcNonceManagerGetter;
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

  getVerificationMethods = async (): Promise<Array<VerificationMethod | LegacyEmailVerificationMethod>> => {
    const verificationMethods = await this._client.getVerificationMethods();

    if (verificationMethods.length === 0) {
      return [{ type: 'verificationKey' }];
    }

    return Promise.all(verificationMethods.map(async (method) => {
      switch (method.type) {
        case 'email': {
          // Compat: encrypted_email value might be missing.
          // verification method registered with SDK < 2.0.0 have encrypted_email set to NULL in out database
          if (!method.encrypted_email) {
            return { type: 'email' };
          }

          const encryptedEmail = utils.fromBase64(method.encrypted_email!);
          const email = utils.toString(await EncryptionV2.decrypt(() => this._localUser.userSecret, EncryptionV2.unserialize(encryptedEmail)));
          if (method.is_preverified) {
            return { type: 'preverifiedEmail', preverifiedEmail: email };
          }
          return { type: 'email', email };
        }
        case 'passphrase': {
          return { type: 'passphrase' };
        }
        case 'oidc_id_token': {
          const providerId = method.provider_id;
          const providerDisplayName = method.provider_display_name;
          return { type: 'oidcIdToken', providerId, providerDisplayName };
        }
        case 'phone_number': {
          const encryptedPhoneNumber = utils.fromBase64(method.encrypted_phone_number);
          const phoneNumber = utils.toString(await EncryptionV2.decrypt(() => this._localUser.userSecret, EncryptionV2.unserialize(encryptedPhoneNumber)));
          if (method.is_preverified) {
            return { type: 'preverifiedPhoneNumber', preverifiedPhoneNumber: phoneNumber };
          }
          return { type: 'phoneNumber', phoneNumber };
        }
        case 'e2e_passphrase': {
          return { type: 'e2ePassphrase' };
        }
        default: {
          // @ts-expect-error this verification method's type is introduced in a later version of the sdk
          throw new UpgradeRequired(`unsupported verification method type: ${method.type}`);
        }
      }
    }));
  };

  setVerificationMethod = async (verification: RemoteVerificationWithToken, allowE2eMethodSwitch: boolean): Promise<void> => {
    const encryptedVerifKey = await this._client.getEncryptedVerificationKey();
    const isE2eMethod = isE2eVerification(verification);
    const switchingOnE2e = isE2eMethod && 'encrypted_verification_key_for_user_secret' in encryptedVerifKey;
    const switchingOffE2e = !isE2eMethod && 'encrypted_verification_key_for_user_key' in encryptedVerifKey;
    if (switchingOnE2e && !allowE2eMethodSwitch)
      throw new InvalidArgument('verification', 'must set allowE2eMethodSwitch flag to turn on E2E verification');
    if (switchingOffE2e && !allowE2eMethodSwitch)
      throw new InvalidArgument('verification', 'must set allowE2eMethodSwitch flag to turn off E2E verification');

    // We only need to re-encrypt the verif key when switching, or updating an E2E method
    let verifKey: Uint8Array | undefined;
    if (switchingOffE2e || isE2eMethod) {
      if ('encrypted_verification_key_for_user_secret' in encryptedVerifKey) {
        verifKey = await decryptVerificationKeyBytes(encryptedVerifKey.encrypted_verification_key_for_user_secret, this._localUser.userSecret);
      } else if ('encrypted_verification_key_for_user_key' in encryptedVerifKey) {
        verifKey = tcrypto.sealDecrypt(encryptedVerifKey.encrypted_verification_key_for_user_key, this._localUser.currentUserKey);
      }
    }

    const request: SetVerificationMethodRequest = {
      verification: await formatVerificationRequest(verification, this),
    };
    if (!isPreverifiedVerificationRequest(request.verification)) {
      request.verification.with_token = verification.withToken; // May be undefined
    }

    if (switchingOffE2e) {
      request.encrypted_verification_key_for_user_secret = encryptVerificationKeyBytes(verifKey!, this._localUser.userSecret);
    } else if (isE2eMethod) {
      const passphraseKey = utils.e2ePassphraseKeyDerivation(utils.fromString(verification.e2ePassphrase));
      request.encrypted_verification_key_for_e2e_passphrase = EncryptionV2.serialize(EncryptionV2.encrypt(passphraseKey, verifKey!));
      request.encrypted_verification_key_for_user_key = tcrypto.sealEncrypt(verifKey!, this._localUser.currentUserKey.publicKey);
    }

    return this._client.setVerificationMethod(request);
  };

  updateDeviceInfo = async (id: Uint8Array, encryptionKeyPair: tcrypto.SodiumKeyPair, signatureKeyPair: tcrypto.SodiumKeyPair): Promise<void> => {
    this._localUser.deviceId = id;
    this._localUser.deviceEncryptionKeyPair = encryptionKeyPair;
    this._localUser.deviceSignatureKeyPair = signatureKeyPair;
    await this.updateLocalUser();
  };

  static async enrollUser(userData: UserData, client: Client, verifications: Array<PreverifiedVerification>): Promise<void> {
    const ghostDeviceKeys = generateGhostDeviceKeys();

    const { trustchainId, userId, userSecret, delegationToken } = userData;
    if (!delegationToken) {
      throw new InternalError('Assertion error, no delegation token for user enrollment');
    }

    const { block, ghostDevice } = generateGhostDevice(trustchainId, userId, ghostDeviceKeys, delegationToken);

    const helper = {
      localUser: userData,
      challengeOidcToken: async () => {
        throw new InvalidArgument('OIDC is not available for user enrollment');
      },
      getOidcTestNonce: () => {
        throw new InvalidArgument('OIDC is not available for user enrollment');
      },
    };

    const request = {
      ghost_device_creation: block,
      encrypted_verification_key: ghostDeviceToEncryptedVerificationKey(ghostDevice, userSecret),
      verifications: await formatVerificationsRequest(verifications, helper),
    };

    await client.enrollUser(request);
  }

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
    const { userCreationBlock, firstDeviceBlock, firstDeviceId, firstDeviceEncryptionKeyPair, firstDeviceSignatureKeyPair, ghostDevice, userKeys } = generateUserCreation(trustchainId, userId, ghostDeviceKeys, this._delegationToken);

    const request: any = {
      ghost_device_creation: userCreationBlock,
      first_device_creation: firstDeviceBlock,
    };

    if ('email' in verification || 'passphrase' in verification || 'oidcIdToken' in verification || 'phoneNumber' in verification) {
      request.v2_encrypted_verification_key = ghostDeviceToEncryptedVerificationKey(ghostDevice, this._localUser.userSecret);
      request.verification = await formatVerificationRequest(verification, this);
      request.verification.with_token = verification.withToken; // May be undefined
    }

    if ('e2ePassphrase' in verification) {
      const verifKey = utils.fromString(ghostDeviceToVerificationKey(ghostDevice));
      const passphraseKey = utils.e2ePassphraseKeyDerivation(utils.fromString(verification.e2ePassphrase));
      request.encrypted_verification_key_for_e2e_passphrase = EncryptionV2.serialize(EncryptionV2.encrypt(passphraseKey, verifKey));
      request.encrypted_verification_key_for_user_key = utils.toBase64(tcrypto.sealEncrypt(verifKey, userKeys.publicKey));
      request.verification = await formatVerificationRequest(verification, this);
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

  getSessionToken = async (verification: VerificationWithToken): Promise<string> => {
    await this.updateLocalUser();

    const { payload, nature } = makeSessionCertificate(verification);
    const block = this._localUser.makeBlock(payload, nature);

    if (!verification.withToken)
      throw new InternalError('Assertion error: Cannot get a session certificate without withToken');

    return this._client.getSessionToken({ session_certificate: block, nonce: verification.withToken.nonce });
  };

  findUserKey = async (publicKey: Uint8Array): Promise<tcrypto.SodiumKeyPair | undefined> => {
    const userKey = this._localUser.findUserKey(publicKey);
    if (!userKey) {
      await this.updateLocalUser();
    }
    return this._localUser.findUserKey(publicKey);
  };

  updateLocalUser = async () => {
    // To update the local user, we can't just get our user because in light
    // mode, only the first device will be returned. So we pull by device to get
    // at least the first device and our device.
    const { root, histories } = await this._client.getUserHistoriesByDeviceIds([this._localUser.deviceId]);
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
    const puks = Object.values(this._provisionalUserKeys);
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
    const remoteVerification: RemoteVerificationWithToken = verification;
    const request = { verification: await formatVerificationRequest(remoteVerification, this) };
    if (!isPreverifiedVerificationRequest(request.verification)) {
      request.verification.with_token = verification.withToken; // May be undefined
    }

    if (isE2eVerification(verification)) {
      const e2eVk = await this._client.getE2eVerificationKey(request);
      const passphraseKey = utils.e2ePassphraseKeyDerivation(utils.fromString(verification.e2ePassphrase));
      return decryptVerificationKey(e2eVk.encrypted_verification_key_for_e2e_passphrase, passphraseKey);
    }

    const encryptedVerificationKey = await this._client.getVerificationKey(request);
    return decryptVerificationKey(encryptedVerificationKey, this._localUser.userSecret);
  };

  getOidcTestNonce = async () => (await this._oidcNonceManagerGetter()).getTestNonce();

  challengeOidcToken = async (idToken: string, testNonce?: string) => {
    let nonce = testNonce;
    if (nonce) {
      utils.assertRawUrlB64StringWithSize(nonce, 'oidc test nonce', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    } else {
      nonce = OidcNonceManager.extractNonce(idToken);
    }

    try {
      utils.assertRawUrlB64StringWithSize(nonce, 'oidc nonce', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    } catch (e) {
      throw new InternalError(`illformed oidc nonce: ${(e as Error).message}`);
    }

    const oidcNonceManage = await this._oidcNonceManagerGetter();
    const challenge = await this._client.getOidcChallenge(nonce);
    const res = await oidcNonceManage.signOidcChallenge(nonce, challenge);
    await oidcNonceManage.removeOidcNonce(nonce);
    return res;
  };
}
