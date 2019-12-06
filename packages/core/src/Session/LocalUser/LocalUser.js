// @flow

import EventEmitter from 'events';
import { tcrypto, utils, type Key } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import { type SecretProvisionalIdentity } from '@tanker/identity';

import KeyStore from './KeyStore';
import BlockGenerator from '../../Blocks/BlockGenerator';

import type { DeviceCreationEntry, DeviceRevocationEntry } from '../../Users/Serialize';
import type { ProvisionalUserKeyPairs } from './KeySafe';
import { findIndex } from '../../utils';
import type { UserData } from '../UserData';
import { type ClaimEntry } from '../ProvisionalIdentity/Serialize';

import { type GhostDevice, type GhostDeviceKeys, ghostDeviceToEncryptedUnlockKey } from './ghostDevice';
import { makeDeviceBlock, type EncryptedUserKeyForGhostDevice } from './deviceCreation';

export type PrivateProvisionalKeys = {|
  appEncryptionKeyPair: tcrypto.SodiumKeyPair,
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair,
|}

export class LocalUser extends EventEmitter {
  _userData: UserData;
  _deviceId: ?Uint8Array;
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
    this._userKeys = {};
    const userKeys = this._keyStore.userKeys;
    for (const userKey of userKeys) {
      this._userKeys[utils.toBase64(userKey.publicKey)] = userKey;
      this._currentUserKey = userKey;
    }
    this._deviceSignatureKeyPair = this._keyStore.signatureKeyPair;
    this._deviceEncryptionKeyPair = this._keyStore.encryptionKeyPair;
    this._deviceId = this._keyStore.deviceId;
  }

  applyProvisionalIdentityClaim = async (provisionalIdentityClaim: ClaimEntry): Promise<ProvisionalUserKeyPairs> => {
    if (!utils.equalArray(provisionalIdentityClaim.user_id, this.userId))
      throw new InternalError('Assertion error: can not apply a claim to another user');

    const userKeyPair = this.findUserKey(provisionalIdentityClaim.recipient_user_public_key);

    const provisionalUserPrivateKeys = tcrypto.sealDecrypt(provisionalIdentityClaim.encrypted_provisional_identity_private_keys, userKeyPair);

    const appEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(0, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));
    const tankerEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));

    const id = utils.toBase64(utils.concatArrays(provisionalIdentityClaim.app_provisional_identity_signature_public_key, provisionalIdentityClaim.tanker_provisional_identity_signature_public_key));

    await this._keyStore.addProvisionalUserKeys(id, appEncryptionKeyPair, tankerEncryptionKeyPair);
    return { id, appEncryptionKeyPair, tankerEncryptionKeyPair };
  };

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

  applyDeviceCreation = async (deviceCreation: DeviceCreationEntry) => {
    // Does is concern our device?
    if (!utils.equalArray(this._deviceEncryptionKeyPair.publicKey, deviceCreation.public_encryption_key)) {
      return;
    }

    this._deviceId = deviceCreation.hash;
    await this._keyStore.setDeviceId(deviceCreation.hash);

    this._blockGenerator = new BlockGenerator(
      this.trustchainId,
      this._deviceSignatureKeyPair.privateKey,
      deviceCreation.hash,
    );

    const userKeyPair = deviceCreation.user_key_pair;
    // Possible for deviceCreation 1
    if (!userKeyPair)
      return;

    const userKey = {
      privateKey: tcrypto.sealDecrypt(userKeyPair.encrypted_private_encryption_key, this._deviceEncryptionKeyPair),
      publicKey: userKeyPair.public_encryption_key,
    };
    await this._keyStore.addUserKey(userKey);
    this._userKeys[utils.toBase64(userKey.publicKey)] = userKey;
    this._currentUserKey = userKey;
    await this._recoverUserKeys();
  }

  _recoverUserKeys = async () => {
    const encryptedUserKeys = await this._keyStore.takeEncryptedUserKeys();
    for (const encryptedUserKey of encryptedUserKeys) {
      // Upgrade from userV1 to userV3
      if (utils.equalArray(new Uint8Array(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE), encryptedUserKey.previous_public_encryption_key))
        continue; // eslint-disable-line no-continue

      const keyPair = this.findUserKey(encryptedUserKey.public_encryption_key);
      if (!keyPair) {
        throw new InternalError('Assertion error: missing key to decrypt previous user key');
      }
      const userKey = {
        privateKey: tcrypto.sealDecrypt(encryptedUserKey.encrypted_previous_encryption_key, keyPair),
        publicKey: encryptedUserKey.previous_public_encryption_key,
      };
      await this._keyStore.prependUserKey(userKey);
      this._userKeys[utils.toBase64(userKey.publicKey)] = userKey;
    }
  }

  applyDeviceRevocation = async (deviceRevocation: DeviceRevocationEntry) => {
    if (this._wasRevoked)
      return;
    const deviceId = this._deviceId;
    if (deviceId && utils.equalArray(deviceRevocation.device_id, deviceId)) {
      this._wasRevoked = true;
      this.emit('device_revoked');
      return;
    }

    const userKeys = deviceRevocation.user_keys;
    // Possible for deviceRevocation V1
    if (!userKeys) {
      return;
    }

    // Store encrypted keys for future recovery
    if (!deviceId) {
      await this._keyStore.prependEncryptedUserKey(userKeys);
      return;
    }

    const privKeyIndex = findIndex(userKeys.private_keys, k => utils.equalArray(k.recipient, deviceId));
    if (privKeyIndex === -1)
      throw new InternalError('Assertion error: Couldn\'t decrypt revocation keys, even tho we know our device ID!');

    const userKey = {
      privateKey: tcrypto.sealDecrypt(userKeys.private_keys[privKeyIndex].key, this._deviceEncryptionKeyPair),
      publicKey: userKeys.public_encryption_key,
    };
    await this._keyStore.addUserKey(userKey);
    this._currentUserKey = userKey;
    this._userKeys[utils.toBase64(userKey.publicKey)] = userKey;
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

  hasClaimedProvisionalIdentity = (provisionalIdentity: SecretProvisionalIdentity) => {
    const appPublicEncryptionKey = provisionalIdentity.public_encryption_key;
    const puks: Array<ProvisionalUserKeyPairs> = (Object.values(this._keyStore.provisionalUserKeys): any);
    for (const puk of puks) {
      if (utils.toBase64(puk.appEncryptionKeyPair.publicKey) === appPublicEncryptionKey) {
        return true;
      }
    }
    return false;
  }
}

export default LocalUser;
