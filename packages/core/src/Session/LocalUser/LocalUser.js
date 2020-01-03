// @flow

import EventEmitter from 'events';
import { tcrypto, utils, type Key } from '@tanker/crypto';
import { InternalError, DeviceRevoked } from '@tanker/errors';

import KeyStore from './KeyStore';
import BlockGenerator from '../../Blocks/BlockGenerator';

import type { DeviceCreationEntry, DeviceRevocationEntry, UserKeys, UserKeyPair } from '../../Users/Serialize';
import { isDeviceCreation, isDeviceRevocation, userEntryFromBlock } from '../../Users/Serialize';
import { applyDeviceCreationToUser, applyDeviceRevocationToUser } from '../../Users/User';
import { verifyDeviceCreation, verifyDeviceRevocation } from '../../Users/Verify';

import type { ProvisionalUserKeyPairs, LocalUserKeys } from './KeySafe';
import { findIndex } from '../../utils';
import type { UserData } from '../UserData';

import { type GhostDevice, type GhostDeviceKeys, ghostDeviceToEncryptedUnlockKey } from './ghostDevice';
import { makeDeviceBlock, type EncryptedUserKeyForGhostDevice } from './deviceCreation';

import { trustchainCreationFromBlock } from './Serialize';
import { verifyTrustchainCreation } from './Verify';


export type PrivateProvisionalKeys = {|
  appEncryptionKeyPair: tcrypto.SodiumKeyPair,
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair,
|}

export class LocalUser extends EventEmitter {
  _userData: UserData;
  _deviceId: ?Uint8Array;
  _trustchainPublicKey: ?Uint8Array;
  _blockGenerator: BlockGenerator;
  _wasRevoked: bool;

  _deviceSignatureKeyPair: tcrypto.SodiumKeyPair;
  _deviceEncryptionKeyPair: tcrypto.SodiumKeyPair;
  _userKeys: { [string]: tcrypto.SodiumKeyPair };
  _currentUserKey: tcrypto.SodiumKeyPair;

  _keyStore: KeyStore;

  constructor(userData: UserData, keyStore: KeyStore) {
    super();

    this._keyStore = keyStore;
    this._userData = userData;
    this._loadStoredData();

    this._blockGenerator = new BlockGenerator(
      this.trustchainId,
      this._deviceSignatureKeyPair.privateKey,
      this._deviceId ? this._deviceId : new Uint8Array(0),
    );
  }

  _loadStoredData = () => {
    const localUserKeys = this._keyStore.localUserKeys;

    if (localUserKeys) {
      this._userKeys = localUserKeys.userKeys;
      this._currentUserKey = localUserKeys.currentUserKey;
      this._deviceId = this._keyStore.deviceId;
      this._trustchainPublicKey = this._keyStore.trustchainPublicKey;
    }

    this._deviceSignatureKeyPair = this._keyStore.signatureKeyPair;
    this._deviceEncryptionKeyPair = this._keyStore.encryptionKeyPair;
  }

  generateDeviceFromGhostDevice = (ghostDevice: GhostDevice, encryptedUserKey: EncryptedUserKeyForGhostDevice) => {
    const ghostDeviceEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(ghostDevice.privateEncryptionKey);

    const decryptedUserPrivateKey = tcrypto.sealDecrypt(
      encryptedUserKey.encryptedPrivateUserKey,
      ghostDeviceEncryptionKeyPair
    );

    const userKeys = tcrypto.getEncryptionKeyPairFromPrivateKey(decryptedUserPrivateKey);

    const ephemeralKeys = tcrypto.makeSignKeyPair();
    const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, this._userData.userId);

    const { deviceBlock } = makeDeviceBlock({
      trustchainId: this._userData.trustchainId,
      userId: this._userData.userId,
      userKeys,
      author: encryptedUserKey.deviceId,
      ephemeralKey: ephemeralKeys.publicKey,
      delegationSignature: tcrypto.sign(delegationBuffer, ghostDevice.privateSignatureKey),
      publicSignatureKey: this._deviceSignatureKeyPair.publicKey,
      publicEncryptionKey: this._deviceEncryptionKeyPair.publicKey,
      blockSignatureKey: ephemeralKeys.privateKey,
      isGhost: false
    });

    return deviceBlock;
  };

  generateUserCreation = (ghostDeviceKeys: GhostDeviceKeys) => {
    const userKeys = tcrypto.makeEncryptionKeyPair();

    const { deviceBlock, deviceId } = makeDeviceBlock({
      trustchainId: this._userData.trustchainId,
      userId: this._userData.userId,
      userKeys,
      author: this.trustchainId,
      ephemeralKey: this._userData.delegationToken.ephemeral_public_signature_key,
      delegationSignature: this._userData.delegationToken.delegation_signature,
      publicSignatureKey: ghostDeviceKeys.signatureKeyPair.publicKey,
      publicEncryptionKey: ghostDeviceKeys.encryptionKeyPair.publicKey,
      blockSignatureKey: this._userData.delegationToken.ephemeral_private_signature_key,
      isGhost: true,
    });

    const encryptedUserKey = {
      publicUserKey: userKeys.publicKey,
      encryptedPrivateUserKey: tcrypto.sealEncrypt(userKeys.privateKey, ghostDeviceKeys.encryptionKeyPair.publicKey),
      deviceId
    };

    const ghostDevice = {
      privateSignatureKey: ghostDeviceKeys.signatureKeyPair.privateKey,
      privateEncryptionKey: ghostDeviceKeys.encryptionKeyPair.privateKey,
    };

    const firstDeviceBlock = this.generateDeviceFromGhostDevice(ghostDevice, encryptedUserKey);
    const encryptedUnlockKey = ghostDeviceToEncryptedUnlockKey(ghostDevice, this._userData.userSecret);
    return {
      userCreationBlock: deviceBlock,
      firstDeviceBlock,
      ghostDevice,
      encryptedUnlockKey,
    };
  };

  get blockGenerator(): BlockGenerator {
    return this._blockGenerator;
  }
  get publicSignatureKey(): Key {
    return this._deviceSignatureKeyPair.publicKey;
  }
  get userId(): Uint8Array {
    return this._userData.userId;
  }
  get trustchainId(): Uint8Array {
    return this._userData.trustchainId;
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
    return this._userData.userSecret;
  }
  get publicIdentity() {
    return { trustchain_id: utils.toBase64(this._userData.trustchainId), target: 'user', value: utils.toBase64(this._userData.userId) };
  }

  findUserKey = (userPublicKey: Uint8Array) => this._userKeys[utils.toBase64(userPublicKey)]

  get currentUserKey(): tcrypto.SodiumKeyPair {
    return this._currentUserKey;
  }

  initializeWithBlocks = async (b64Blocks: Array<string>) => {
    // Blocks should contain at least root block and first device
    if (b64Blocks.length < 2) {
      throw new InternalError('Assertion error: not enough blocks to update local user');
    }
    const trustchainCreationEntry = trustchainCreationFromBlock(b64Blocks[0]);
    verifyTrustchainCreation(trustchainCreationEntry, this.trustchainId);
    await this._keyStore.setTrustchainPublicKey(trustchainCreationEntry.public_signature_key);
    this._trustchainPublicKey = trustchainCreationEntry.public_signature_key;

    return this._initializeWithUserBlocks(b64Blocks.slice(1));
  }

  _initializeWithUserBlocks = async (userBlocks: Array<string>) => {
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
    await this._keyStore.setLocalUserKeys(localUserKeys);
    await this._setDeviceId(deviceId);
  }

  _setDeviceId = async (deviceId: Uint8Array) => {
    this._deviceId = deviceId;
    await this._keyStore.setDeviceId(this._deviceId);

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

  findProvisionalUserKey = (appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): ?PrivateProvisionalKeys => {
    const id = utils.concatArrays(appPublicSignatureKey, tankerPublicSignatureKey);
    const result = this._keyStore.provisionalUserKeys[utils.toBase64(id)];
    if (result) {
      const { appEncryptionKeyPair, tankerEncryptionKeyPair } = result;
      return { appEncryptionKeyPair, tankerEncryptionKeyPair };
    }
    return null;
  }

  storeProvisionalUserKey = (appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array, privateProvisionalKeys: PrivateProvisionalKeys) => {
    const id = utils.concatArrays(appPublicSignatureKey, tankerPublicSignatureKey);
    return this._keyStore.addProvisionalUserKeys(utils.toBase64(id), privateProvisionalKeys.appEncryptionKeyPair, privateProvisionalKeys.tankerEncryptionKeyPair);
  }

  hasProvisionalUserKey = (appPublicEncryptionKey: Uint8Array) => {
    const puks: Array<ProvisionalUserKeyPairs> = (Object.values(this._keyStore.provisionalUserKeys): any);
    return puks.some(puk => utils.equalArray(puk.appEncryptionKeyPair.publicKey, appPublicEncryptionKey));
  }
}

export default LocalUser;
