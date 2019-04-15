// @flow

import EventEmitter from 'events';
import { tcrypto, utils, type Key, type b64string } from '@tanker/crypto';
import { type PublicIdentity } from '@tanker/identity';

import { type UnlockMethods } from '../Network/Client';
import KeyStore from './Keystore';
import BlockGenerator from '../Blocks/BlockGenerator';
import { type UserData } from '../UserData';
import { findIndex } from '../utils';
import { type VerifiedDeviceCreation, type VerifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { type VerifiedProvisionalIdentityClaim } from '../UnverifiedStore/ProvisionalIdentityClaimUnverifiedStore';

export type DeviceKeys = {|
  deviceId: ?b64string,
  signaturePair: tcrypto.SodiumKeyPair,
  encryptionPair: tcrypto.SodiumKeyPair,
|}

export class LocalUser extends EventEmitter {
  _userData: UserData;
  _deviceId: ?Uint8Array;
  _unlockMethods: UnlockMethods;
  _blockGenerator: BlockGenerator;
  _wasRevoked: bool;

  _deviceSignatureKeyPair: tcrypto.SodiumKeyPair;
  _deviceEncryptionKeyPair: tcrypto.SodiumKeyPair;
  _userKeys: { [string]: tcrypto.SodiumKeyPair };
  _currentUserKey: tcrypto.SodiumKeyPair;
  _provisionalUserKeys: { [string]: { appEncryptionKeyPair: tcrypto.SodiumKeyPair, tankerEncryptionKeyPair: tcrypto.SodiumKeyPair } } = {};

  _keyStore: KeyStore;

  constructor(userData: UserData, keyStore: KeyStore) {
    super();

    this._keyStore = keyStore;
    this._unlockMethods = [];
    this._userData = userData;
    this.loadStoredData();

    this._blockGenerator = new BlockGenerator(
      this.trustchainId,
      this.privateSignatureKey,
      this._deviceId ? this._deviceId : new Uint8Array(0),
    );
  }

  loadStoredData = () => {
    this._userKeys = {};
    const userKeys = this._keyStore.userKeys;
    for (const userKey of userKeys) {
      this._userKeys[utils.toBase64(userKey.publicKey)] = userKey;
      this._currentUserKey = userKey;
    }
    const provisionalUserKeys = this._keyStore.provisionalUserKeys || [];
    for (const key of provisionalUserKeys)
      this._provisionalUserKeys[key.id] = { ...key };
    this._deviceSignatureKeyPair = this._keyStore.signatureKeyPair;
    this._deviceEncryptionKeyPair = this._keyStore.encryptionKeyPair;
    this._deviceId = this._keyStore.deviceId;
  }

  setUnlockMethods = (unlockMethods: UnlockMethods) => {
    this._unlockMethods = unlockMethods;
  }

  applyProvisionalIdentityClaim = async (provisionalIdentityClaim: VerifiedProvisionalIdentityClaim) => {
    if (!utils.equalArray(provisionalIdentityClaim.user_id, this.userId))
      throw new Error('Assertion error: can not apply a claim to another user');

    const userKeyPair = this.findUserKey(provisionalIdentityClaim.recipient_user_public_key);

    const provisionalUserPrivateKeys = tcrypto.sealDecrypt(provisionalIdentityClaim.encrypted_provisional_identity_private_keys, userKeyPair);

    const appEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(0, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));
    const tankerEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));

    const id = utils.toBase64(utils.concatArrays(provisionalIdentityClaim.app_provisional_identity_signature_public_key, provisionalIdentityClaim.tanker_provisional_identity_signature_public_key));

    this._provisionalUserKeys[id] = { appEncryptionKeyPair, tankerEncryptionKeyPair };
    await this._keyStore.addProvisionalUserKeys(id, appEncryptionKeyPair, tankerEncryptionKeyPair);
  }

  applyDeviceCreation = async (deviceCreation: VerifiedDeviceCreation) => {
    // Does is concern our device?
    if (!utils.equalArray(this.publicEncryptionKey, deviceCreation.public_encryption_key)) {
      return;
    }

    this._deviceId = deviceCreation.hash;
    await this._keyStore.setDeviceId(deviceCreation.hash);

    this._blockGenerator = new BlockGenerator(
      this.trustchainId,
      this.privateSignatureKey,
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
        throw new Error('Assertion error: missing key to decrypt previous user key');
      }
      const userKey = {
        privateKey: tcrypto.sealDecrypt(encryptedUserKey.encrypted_previous_encryption_key, keyPair),
        publicKey: encryptedUserKey.previous_public_encryption_key,
      };
      await this._keyStore.prependUserKey(userKey);
      this._userKeys[utils.toBase64(userKey.publicKey)] = userKey;
    }
  }

  applyDeviceRevocation = async (deviceRevocation: VerifiedDeviceRevocation) => {
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
      await this._keyStore.addEncryptedUserKey(userKeys);
      return;
    }

    const privKeyIndex = findIndex(userKeys.private_keys, k => utils.equalArray(k.recipient, deviceId));
    if (privKeyIndex === -1)
      throw new Error('Assertion error: Couldn\'t decrypt revocation keys, even tho we know our device ID!');

    const userKey = {
      privateKey: tcrypto.sealDecrypt(userKeys.private_keys[privKeyIndex].key, this._deviceEncryptionKeyPair),
      publicKey: userKeys.public_encryption_key,
    };
    await this._keyStore.addUserKey(userKey);
    this._currentUserKey = userKey;
    this._userKeys[utils.toBase64(userKey.publicKey)] = userKey;
  }

  get blockGenerator(): BlockGenerator {
    return this._blockGenerator;
  }
  get publicSignatureKey(): Key {
    return this._deviceSignatureKeyPair.publicKey;
  }
  get privateSignatureKey(): Key {
    return this._deviceSignatureKeyPair.privateKey;
  }
  get publicEncryptionKey(): Key {
    return this._deviceEncryptionKeyPair.publicKey;
  }
  get privateEncryptionKey(): Key {
    return this._deviceEncryptionKeyPair.privateKey;
  }
  get currentUserKey(): tcrypto.SodiumKeyPair {
    return this._currentUserKey;
  }
  get deviceId(): Uint8Array {
    if (!this._deviceId)
      throw new Error('Assertion error: device ID not set');
    return this._deviceId;
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
  get unlockMethods(): UnlockMethods {
    return this._unlockMethods;
  }
  get wasRevoked(): bool {
    return this._wasRevoked;
  }
  get publicIdentity(): PublicIdentity {
    return { trustchain_id: utils.toBase64(this._userData.trustchainId), target: 'user', value: utils.toBase64(this._userData.userId) };
  }


  findUserKey = (userPublicKey: Uint8Array) => this._userKeys[utils.toBase64(userPublicKey)]

  findProvisionalUserKey = (recipient: Uint8Array) => this._provisionalUserKeys[utils.toBase64(recipient)]

  deviceKeys = (): DeviceKeys => ({
    signaturePair: this._deviceSignatureKeyPair,
    encryptionPair: this._deviceEncryptionKeyPair,
    deviceId: this._deviceId ? utils.toBase64(this._deviceId) : null
  });
}

export default LocalUser;
