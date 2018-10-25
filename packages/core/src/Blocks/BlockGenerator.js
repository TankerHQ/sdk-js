// @flow

import { tcrypto, utils, type Key, type b64string } from '@tanker/crypto';

import {
  serializeUserDeviceV1,
  serializeUserDeviceV3,
  serializeKeyPublish,
  serializeDeviceRevocationV2,
  serializeUserGroupCreation,
  serializeUserGroupAddition,
  preferredNature,
  type UserDeviceRecord,
  type UserKeys,
  type KeyPublishRecord,
  type KeyPublishToUserGroupRecord,
  type UserGroupCreationRecord,
  type UserGroupAdditionRecord,
  type NatureKind,
  NATURE,
  NATURE_KIND,
} from './payloads';
import { signBlock, type Block } from './Block';
import { type DelegationToken } from '../Session/delegation';
import { getLastUserPublicKey, type User, type Device } from '../Users/UserStore';
import { InvalidDelegationToken } from '../errors';
import { concatArrays } from '../Blocks/Serialize';

export function getUserGroupCreationBlockSignData(record: UserGroupCreationRecord): Uint8Array {
  return concatArrays(
    record.public_signature_key,
    record.public_encryption_key,
    record.encrypted_group_private_signature_key,
    ...record.encrypted_group_private_encryption_keys_for_users.map(gek => concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key))
  );
}

export function getUserGroupAdditionBlockSignData(record: UserGroupAdditionRecord): Uint8Array {
  return concatArrays(
    record.group_id,
    record.previous_group_block,
    ...record.encrypted_group_private_encryption_keys_for_users.map(gek => concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key))
  );
}

export class BlockGenerator {
  trustchainId: Uint8Array;
  privateSignatureKey: Key;
  deviceId: Uint8Array;

  constructor(
    trustchainId: Uint8Array,
    privateSignatureKey: Key,
    deviceId: Uint8Array
  ) {
    this.trustchainId = trustchainId;
    this.privateSignatureKey = privateSignatureKey;
    this.deviceId = deviceId;
  }

  _makeDeviceBlock(
    userId: Uint8Array,
    author: Uint8Array,
    ephemeralKey: Uint8Array,
    delegationSignature: Uint8Array,
    publicSignatureKey: Uint8Array,
    publicEncryptionKey: Uint8Array,
    blockSignatureKey: Uint8Array,
    userKeys: tcrypto.SodiumKeyPair,
    isGhost: bool,
    isServer: bool
  ): Block {
    const encryptedUserKey = tcrypto.sealEncrypt(
      userKeys.privateKey,
      publicEncryptionKey,
    );
    const userDevice: UserDeviceRecord = {
      ephemeral_public_signature_key: ephemeralKey,
      user_id: userId,
      delegation_signature: delegationSignature,
      public_signature_key: publicSignatureKey,
      public_encryption_key: publicEncryptionKey,
      last_reset: new Uint8Array(tcrypto.HASH_SIZE),
      user_key_pair: {
        public_encryption_key: userKeys.publicKey,
        encrypted_private_encryption_key: encryptedUserKey,
      },
      is_ghost_device: isGhost,
      is_server_device: isServer,
      revoked: Number.MAX_SAFE_INTEGER,
    };

    return signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.device_creation),
      author,
      payload: serializeUserDeviceV3(userDevice)
    }, blockSignatureKey);
  }

  makeNewUserBlock(userId: Uint8Array, delegationToken: DelegationToken, publicSignatureKey: Uint8Array, publicEncryptionKey: Uint8Array) {
    if (!utils.equalArray(delegationToken.user_id, userId))
      throw new InvalidDelegationToken(`delegation token for user ${utils.toBase64(delegationToken.user_id)}, but we are ${utils.toBase64(userId)}`);
    const userKeys = tcrypto.makeEncryptionKeyPair();

    return this._makeDeviceBlock(
      userId,
      this.trustchainId,
      delegationToken.ephemeral_public_signature_key,
      delegationToken.delegation_signature,
      publicSignatureKey,
      publicEncryptionKey,
      delegationToken.ephemeral_private_signature_key,
      userKeys,
      false,
      false
    );
  }

  makeNewDeviceBlock(
    userId: Uint8Array,
    userKeys: tcrypto.SodiumKeyPair,
    publicSignatureKey: Uint8Array,
    publicEncryptionKey: Uint8Array,
    isGhost: bool,
    isServer: bool
  ): Block {
    const ephemeralKeys = tcrypto.makeSignKeyPair();
    const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, userId);

    return this._makeDeviceBlock(
      userId,
      this.deviceId,
      ephemeralKeys.publicKey,
      tcrypto.sign(delegationBuffer, this.privateSignatureKey),
      publicSignatureKey,
      publicEncryptionKey,
      ephemeralKeys.privateKey,
      userKeys,
      isGhost,
      isServer
    );
  }

  _rotateUserKeys = (devices: Array<Device>, currentUserKey: tcrypto.SodiumKeyPair): UserKeys => {
    const newUserKeyPair = tcrypto.makeEncryptionKeyPair();

    const encryptedPreviousUserKey = tcrypto.sealEncrypt(
      currentUserKey.privateKey,
      newUserKeyPair.publicKey,
    );

    const encryptedUserKeyForDevices = devices.map(device => {
      const encryptedUserKey = tcrypto.sealEncrypt(
        newUserKeyPair.privateKey,
        device.devicePublicEncryptionKey,
      );
      return {
        recipient: utils.fromBase64(device.deviceId),
        key: encryptedUserKey,
      };
    });

    return {
      public_encryption_key: newUserKeyPair.publicKey,
      previous_public_encryption_key: currentUserKey.publicKey,
      encrypted_previous_encryption_key: encryptedPreviousUserKey,
      private_keys: encryptedUserKeyForDevices,
    };
  }

  makeDeviceRevocationBlock(user: User, currentUserKeys: tcrypto.SodiumKeyPair, deviceIdToRevoke: b64string) {
    const remainingDevices = user.devices
      .filter(device => device.revokedAt === Number.MAX_SAFE_INTEGER && device.deviceId !== deviceIdToRevoke);

    const userKeys = this._rotateUserKeys(remainingDevices, currentUserKeys);
    const revocationRecord = {
      device_id: utils.fromBase64(deviceIdToRevoke),
      user_keys: userKeys
    };

    return signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.device_revocation),
      author: this.deviceId,
      payload: serializeDeviceRevocationV2(revocationRecord)
    }, this.privateSignatureKey);
  }

  addDeviceV1(device: UserDeviceRecord): Block {
    const ephemeralKeys = tcrypto.makeSignKeyPair();
    const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, device.user_id);
    /* eslint-disable no-param-reassign */
    device.ephemeral_public_signature_key = ephemeralKeys.publicKey;
    device.delegation_signature = tcrypto.sign(delegationBuffer, this.privateSignatureKey);
    device.last_reset = new Uint8Array(tcrypto.HASH_SIZE);

    const deviceBlock = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: NATURE.device_creation_v1,
      author: this.deviceId,
      payload: serializeUserDeviceV1(device)
    }, ephemeralKeys.privateKey);

    return deviceBlock;
  }

  makeKeyPublishBlock(record: KeyPublishRecord, nature: NatureKind): Block {
    const pKeyBlock = signBlock(
      {
        index: 0,
        trustchain_id: this.trustchainId,
        nature: preferredNature(nature),
        author: this.deviceId,
        payload: serializeKeyPublish(record)
      },
      this.privateSignatureKey
    );

    return pKeyBlock;
  }

  keyPublishToUserGroup(pKey: KeyPublishToUserGroupRecord): Block {
    const pKeyBlock = signBlock(
      {
        index: 0,
        trustchain_id: this.trustchainId,
        nature: preferredNature(NATURE_KIND.key_publish_to_user_group),
        author: this.deviceId,
        payload: serializeKeyPublish(pKey)
      },
      this.privateSignatureKey
    );

    return pKeyBlock;
  }

  keyPublish(pKey: KeyPublishRecord): Block {
    const pKeyBlock = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.key_publish_to_device),
      author: this.deviceId,
      payload: serializeKeyPublish(pKey)
    }, this.privateSignatureKey);

    return pKeyBlock;
  }

  createUserGroup(signatureKeyPair: tcrypto.SodiumKeyPair, encryptionKeyPair: tcrypto.SodiumKeyPair, users: Array<User>): Block {
    const encryptedPrivateSignatureKey = tcrypto.sealEncrypt(signatureKeyPair.privateKey, encryptionKeyPair.publicKey);

    const keysForUsers = users.map(u => {
      const userPublicKey = getLastUserPublicKey(u);
      if (!userPublicKey)
        throw new Error('createUserGroup: user does not have user keys');
      return {
        public_user_encryption_key: userPublicKey,
        encrypted_group_private_encryption_key: tcrypto.sealEncrypt(encryptionKeyPair.privateKey, userPublicKey),
      };
    });

    const payload = {
      public_signature_key: signatureKeyPair.publicKey,
      public_encryption_key: encryptionKeyPair.publicKey,
      encrypted_group_private_signature_key: encryptedPrivateSignatureKey,
      encrypted_group_private_encryption_keys_for_users: keysForUsers,
      self_signature: new Uint8Array(0),
    };

    const signData = getUserGroupCreationBlockSignData(payload);
    payload.self_signature = tcrypto.sign(signData, signatureKeyPair.privateKey);

    const block = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.user_group_creation),
      author: this.deviceId,
      payload: serializeUserGroupCreation(payload)
    }, this.privateSignatureKey);

    return block;
  }

  addToUserGroup(groupId: Uint8Array, privateSignatureKey: Uint8Array, previousGroupBlock: Uint8Array, privateEncryptionKey: Uint8Array, users: Array<User>): Block {
    const keysForUsers = users.map(u => {
      const userPublicKey = getLastUserPublicKey(u);
      if (!userPublicKey)
        throw new Error('addToUserGroup: user does not have user keys');
      return {
        public_user_encryption_key: userPublicKey,
        encrypted_group_private_encryption_key: tcrypto.sealEncrypt(privateEncryptionKey, userPublicKey),
      };
    });

    const payload = {
      group_id: groupId,
      previous_group_block: previousGroupBlock,
      encrypted_group_private_encryption_keys_for_users: keysForUsers,
      self_signature_with_current_key: new Uint8Array(0),
    };

    const signData = getUserGroupAdditionBlockSignData(payload);
    payload.self_signature_with_current_key = tcrypto.sign(signData, privateSignatureKey);

    const block = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.user_group_addition),
      author: this.deviceId,
      payload: serializeUserGroupAddition(payload)
    }, this.privateSignatureKey);

    return block;
  }
}

export default BlockGenerator;
