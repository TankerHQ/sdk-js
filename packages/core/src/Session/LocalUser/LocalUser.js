// @flow

import EventEmitter from 'events';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError, DeviceRevoked } from '@tanker/errors';

import BlockGenerator from '../../Blocks/BlockGenerator';
import type { DeviceCreationEntry, DeviceRevocationEntry, UserKeys, UserKeyPair } from '../../Users/Serialize';
import { isDeviceCreation, isDeviceRevocation, userEntryFromBlock } from '../../Users/Serialize';

import { type LocalData } from './KeyStore';

import { applyDeviceCreationToUser, applyDeviceRevocationToUser } from '../../Users/User';
import { verifyDeviceCreation, verifyDeviceRevocation } from '../../Users/Verify';

import type { ProvisionalUserKeyPairs, LocalUserKeys, IndexedProvisionalUserKeyPairs } from './KeySafe';
import { findIndex } from '../../utils';

import { trustchainCreationFromBlock } from './Serialize';
import { verifyTrustchainCreation } from './Verify';

export type PrivateProvisionalKeys = {|
  appEncryptionKeyPair: tcrypto.SodiumKeyPair,
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair,
|}

export class LocalUser extends EventEmitter {
  _trustchainId: Uint8Array;
  _userId: Uint8Array;
  _userSecret: Uint8Array;

  _blockGenerator: BlockGenerator;

  _deviceSignatureKeyPair: tcrypto.SodiumKeyPair;
  _deviceEncryptionKeyPair: tcrypto.SodiumKeyPair;
  _userKeys: { [string]: tcrypto.SodiumKeyPair };
  _currentUserKey: ?tcrypto.SodiumKeyPair;
  _provisionalUserKeys: IndexedProvisionalUserKeyPairs;

  _deviceId: ?Uint8Array;
  _trustchainPublicKey: ?Uint8Array;

  constructor(trustchainId: Uint8Array, userId: Uint8Array, userSecret: Uint8Array, localData: LocalData) {
    super();

    this._trustchainId = trustchainId;
    this._userId = userId;
    this._userSecret = userSecret;

    this._deviceEncryptionKeyPair = localData.deviceEncryptionKeyPair;
    this._deviceSignatureKeyPair = localData.deviceSignatureKeyPair;
    this._userKeys = localData.userKeys;
    this._currentUserKey = localData.currentUserKey;
    this._trustchainPublicKey = localData.trustchainPublicKey;
    this._deviceId = localData.deviceId;
    this._provisionalUserKeys = localData.provisionalUserKeys;

    this._blockGenerator = new BlockGenerator(
      this.trustchainId,
      this._deviceSignatureKeyPair.privateKey,
      this._deviceId ? this._deviceId : new Uint8Array(0),
    );
  }

  get localData() {
    return {
      deviceEncryptionKeyPair: this._deviceEncryptionKeyPair,
      deviceSignatureKeyPair: this._deviceSignatureKeyPair,
      userKeys: this._userKeys,
      currentUserKey: this._currentUserKey,
      trustchainPublicKey: this._trustchainPublicKey,
      deviceId: this._deviceId,
      provisionalUserKeys: this._provisionalUserKeys,
    };
  }

  get blockGenerator(): BlockGenerator {
    return this._blockGenerator;
  }
  get deviceEncryptionKeyPair() {
    return this._deviceEncryptionKeyPair;
  }
  get deviceSignatureKeyPair() {
    return this._deviceSignatureKeyPair;
  }
  get userId(): Uint8Array {
    return this._userId;
  }
  get deviceId(): Uint8Array {
    if (!this._deviceId) {
      throw new InternalError('Assertion failed: localUser was not initialized');
    }
    return this._deviceId;
  }
  get trustchainId(): Uint8Array {
    return this._trustchainId;
  }
  get isInitialized(): bool {
    return !!this._trustchainPublicKey && !!this._deviceId;
  }
  get trustchainPublicKey(): Uint8Array {
    if (!this._trustchainPublicKey) {
      throw new InternalError('Assertion error: trustchain public key was not set');
    }
    return this._trustchainPublicKey;
  }
  get userSecret(): Uint8Array {
    return this._userSecret;
  }

  findUserKey = (userPublicKey: Uint8Array) => this._userKeys[utils.toBase64(userPublicKey)]

  get currentUserKey(): tcrypto.SodiumKeyPair {
    if (!this._currentUserKey) {
      throw new InternalError('Assertion failed: localUser was not initialized');
    }
    return this._currentUserKey;
  }

  initializeWithBlocks = (b64Blocks: Array<string>) => {
    // Blocks should contain at least root block and first device
    if (b64Blocks.length < 2) {
      throw new InternalError('Assertion error: not enough blocks to update local user');
    }
    const trustchainCreationEntry = trustchainCreationFromBlock(b64Blocks[0]);
    verifyTrustchainCreation(trustchainCreationEntry, this.trustchainId);
    this._trustchainPublicKey = trustchainCreationEntry.public_signature_key;

    return this._initializeWithUserBlocks(b64Blocks.slice(1));
  }

  _initializeWithUserBlocks = (userBlocks: Array<string>) => {
    let user = null;
    const encryptedUserKeys: Array<UserKeys | UserKeyPair> = [];
    let deviceId;

    for (const b64Block of userBlocks) {
      const userEntry = userEntryFromBlock(b64Block);
      if (isDeviceCreation(userEntry.nature)) {
        const deviceCreationEntry = ((userEntry: any): DeviceCreationEntry);
        verifyDeviceCreation(deviceCreationEntry, user, this.trustchainPublicKey);
        user = applyDeviceCreationToUser(deviceCreationEntry, user);
        if (utils.equalArray(this._deviceEncryptionKeyPair.publicKey, deviceCreationEntry.public_encryption_key)) {
          deviceId = deviceCreationEntry.hash;
          if (deviceCreationEntry.user_key_pair) {
            encryptedUserKeys.unshift(deviceCreationEntry.user_key_pair);
          }
        }
      } else if (isDeviceRevocation(userEntry.nature)) {
        if (!user) {
          throw new InternalError('Assertion error: Cannot revoke device of non existing user');
        }
        const deviceRevocationEntry = ((userEntry: any): DeviceRevocationEntry);
        verifyDeviceRevocation(deviceRevocationEntry, user);
        user = applyDeviceRevocationToUser(deviceRevocationEntry, user);
        if (this._deviceId && utils.equalArray(deviceRevocationEntry.device_id, this._deviceId)) {
          throw new DeviceRevoked();
        }
        if (deviceRevocationEntry.user_keys) {
          encryptedUserKeys.unshift(deviceRevocationEntry.user_keys);
        }
      }
    }

    if (!deviceId) {
      throw new InternalError('Assertion error: Cannot decrypt keys: current device not found');
    }
    const localUserKeys = this._decryptUserKeys(encryptedUserKeys, deviceId);

    if (!localUserKeys.currentUserKey) {
      throw new InternalError('Assertion error: No current user key');
    }
    this._userKeys = localUserKeys.userKeys;
    this._currentUserKey = localUserKeys.currentUserKey;
    this._deviceId = deviceId;

    this._blockGenerator = new BlockGenerator(
      this.trustchainId,
      this._deviceSignatureKeyPair.privateKey,
      deviceId,
    );
  }

  _localUserKeysFromPrivateKey = (encryptedPrivateKey: Uint8Array, encryptionKeyPair: tcrypto.SodiumKeyPair, existingLocalUserKeys: ?LocalUserKeys): LocalUserKeys => {
    const privateKey = tcrypto.sealDecrypt(encryptedPrivateKey, encryptionKeyPair);
    const keyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(privateKey);
    const b64PublicKey = utils.toBase64(keyPair.publicKey);
    const res = {};
    res[b64PublicKey] = keyPair;

    if (existingLocalUserKeys) {
      return {
        userKeys: { ...existingLocalUserKeys.userKeys, ...res },
        currentUserKey: existingLocalUserKeys.currentUserKey,
      };
    }
    return {
      userKeys: res,
      currentUserKey: keyPair,
    };
  }

  _decryptUserKeys = (encryptedUserKeys: Array<UserKeys | UserKeyPair>, deviceId: Uint8Array): LocalUserKeys => {
    let localUserKeys;
    for (const encryptedUserKey of encryptedUserKeys) {
      // Key for local device
      if (encryptedUserKey.encrypted_private_encryption_key) {
        localUserKeys = this._localUserKeysFromPrivateKey(encryptedUserKey.encrypted_private_encryption_key, this._deviceEncryptionKeyPair, localUserKeys);
        continue;
      }

      // Upgrade from userV1 to userV3
      if (utils.equalArray(new Uint8Array(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE), encryptedUserKey.previous_public_encryption_key))
        continue;

      // Key encrypted before our device creation
      const existingUserKey = localUserKeys && localUserKeys.userKeys[utils.toBase64(encryptedUserKey.public_encryption_key)];
      if (existingUserKey) {
        localUserKeys = this._localUserKeysFromPrivateKey(encryptedUserKey.encrypted_previous_encryption_key, existingUserKey, localUserKeys);
      // Key encrypted after our device creation
      } else {
        const privKeyIndex = findIndex(encryptedUserKey.private_keys, k => utils.equalArray(k.recipient, deviceId));
        if (privKeyIndex === -1)
          throw new InternalError('Assertion error: Couldn\'t decrypt user keys from revocation');

        localUserKeys = this._localUserKeysFromPrivateKey(encryptedUserKey.private_keys[privKeyIndex].key, this._deviceEncryptionKeyPair, localUserKeys);
      }
    }
    if (!localUserKeys) {
      throw new InternalError('Assertion error: no user keys');
    }
    return localUserKeys;
  }

  get provisionalUserKeys() {
    return this._provisionalUserKeys;
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

  addProvisionalUserKey = (appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array, privateProvisionalKeys: PrivateProvisionalKeys) => {
    const id = utils.toBase64(utils.concatArrays(appPublicSignatureKey, tankerPublicSignatureKey));
    this._provisionalUserKeys[id] = {
      id,
      appEncryptionKeyPair: privateProvisionalKeys.appEncryptionKeyPair,
      tankerEncryptionKeyPair: privateProvisionalKeys.tankerEncryptionKeyPair,
    };
  }

  hasProvisionalUserKey = (appPublicEncryptionKey: Uint8Array) => {
    const puks: Array<ProvisionalUserKeyPairs> = (Object.values(this._provisionalUserKeys): any);
    return puks.some(puk => utils.equalArray(puk.appEncryptionKeyPair.publicKey, appPublicEncryptionKey));
  }
}

export default LocalUser;
