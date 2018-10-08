// @flow

import { tcrypto, utils, type Key } from '@tanker/crypto';

import {
  serializeUserDeviceV1,
  serializeUserDeviceV3,
  serializeKeyPublish,
  serializeKeyPublishToUser,
  serializeKeyPublishToUserGroup,
  serializeDeviceRevocationV2,
  serializeUserGroupCreation,
  serializeUserGroupAddition,
  preferredNature,
  type UserDeviceRecord,
  type KeyPublishRecord,
  type KeyPublishToUserRecord,
  type KeyPublishToUserGroupRecord,
  type DeviceRevocationRecord,
  type UserGroupCreationRecord,
  type UserGroupAdditionRecord,
  NATURE,
  NATURE_KIND,
} from './payloads';
import { signBlock, type Block } from './Block';
import { type DelegationToken } from '../Session/delegation';
import { getLastUserPublicKey, type User } from '../Users/UserStore';
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

  addUser(user: UserDeviceRecord, delegationToken: DelegationToken): Block {
    if (!utils.equalArray(delegationToken.user_id, user.user_id))
      throw new InvalidDelegationToken(`delegation token for user ${utils.toBase64(delegationToken.user_id)}, but we are ${utils.toBase64(user.user_id)}`);

    user.ephemeral_public_signature_key = delegationToken.ephemeral_public_signature_key; // eslint-disable-line no-param-reassign
    user.delegation_signature = delegationToken.delegation_signature; // eslint-disable-line no-param-reassign

    const rootBlockHash = this.trustchainId;

    const userBlock = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.device_creation),
      author: rootBlockHash,
      payload: serializeUserDeviceV3(user)
    }, delegationToken.ephemeral_private_signature_key);

    return userBlock;
  }

  addDevice(device: UserDeviceRecord): Block {
    const ephemeralKeys = tcrypto.makeSignKeyPair();
    const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, device.user_id);
    /* eslint-disable no-param-reassign */
    device.ephemeral_public_signature_key = ephemeralKeys.publicKey;
    device.delegation_signature = tcrypto.sign(delegationBuffer, this.privateSignatureKey);
    device.last_reset = new Uint8Array(tcrypto.HASH_SIZE);

    const deviceBlock = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.device_creation),
      author: this.deviceId,
      payload: serializeUserDeviceV3(device)
    }, ephemeralKeys.privateKey);

    return deviceBlock;
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

  keyPublishToUser(pKey: KeyPublishToUserRecord): Block {
    const pKeyBlock = signBlock(
      {
        index: 0,
        trustchain_id: this.trustchainId,
        nature: preferredNature(NATURE_KIND.key_publish_to_user),
        author: this.deviceId,
        payload: serializeKeyPublishToUser(pKey)
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
        payload: serializeKeyPublishToUserGroup(pKey)
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

  revokeDevice(device: DeviceRevocationRecord): Block {
    const revokeDeviceBlock = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.device_revocation),
      author: this.deviceId,
      payload: serializeDeviceRevocationV2(device)
    }, this.privateSignatureKey);

    return revokeDeviceBlock;
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
