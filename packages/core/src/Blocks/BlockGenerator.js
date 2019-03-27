// @flow

import { tcrypto, utils, type Key, type b64string } from '@tanker/crypto';

import {
  serializeUserDeviceV3,
  serializeKeyPublish,
  serializeDeviceRevocationV2,
  serializeUserGroupCreation,
  serializeUserGroupAddition,
  type UserDeviceRecord,
  type UserKeys,
  type UserGroupCreationRecord,
  type UserGroupAdditionRecord,
} from './payloads';
import { preferredNature, type NatureKind, NATURE_KIND } from './Nature';

import { signBlock, type Block } from './Block';
import { type DelegationToken } from '../Session/delegation';
import { getLastUserPublicKey, type User, type Device } from '../Users/User';
import { InvalidDelegationToken } from '../errors';

export function getUserGroupCreationBlockSignData(record: UserGroupCreationRecord): Uint8Array {
  return utils.concatArrays(
    record.public_signature_key,
    record.public_encryption_key,
    record.encrypted_group_private_signature_key,
    ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key))
  );
}

export function getUserGroupAdditionBlockSignData(record: UserGroupAdditionRecord): Uint8Array {
  return utils.concatArrays(
    record.group_id,
    record.previous_group_block,
    ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key))
  );
}


type MakeDeviceParams = {
  userId: Uint8Array,
  userKeys: tcrypto.SodiumKeyPair,
  author: Uint8Array,
  ephemeralKey: Uint8Array,
  delegationSignature: Uint8Array,
  publicSignatureKey: Uint8Array,
  publicEncryptionKey: Uint8Array,
  blockSignatureKey: Uint8Array,
  isGhost: bool,
};

type NewUserParams = {
  userId: Uint8Array,
  delegationToken: DelegationToken,
  publicSignatureKey: Uint8Array,
  publicEncryptionKey: Uint8Array
};


type NewDeviceParams = {
    userId: Uint8Array,
    userKeys: tcrypto.SodiumKeyPair,
    publicSignatureKey: Uint8Array,
    publicEncryptionKey: Uint8Array,
    isGhost: bool,
};


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

  _makeDeviceBlock(args: MakeDeviceParams): Block {
    const encryptedUserKey = tcrypto.sealEncrypt(
      args.userKeys.privateKey,
      args.publicEncryptionKey,
    );
    const userDevice: UserDeviceRecord = {
      ephemeral_public_signature_key: args.ephemeralKey,
      user_id: args.userId,
      delegation_signature: args.delegationSignature,
      public_signature_key: args.publicSignatureKey,
      public_encryption_key: args.publicEncryptionKey,
      last_reset: new Uint8Array(tcrypto.HASH_SIZE),
      user_key_pair: {
        public_encryption_key: args.userKeys.publicKey,
        encrypted_private_encryption_key: encryptedUserKey,
      },
      is_ghost_device: args.isGhost,
      revoked: Number.MAX_SAFE_INTEGER,
    };

    return signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.device_creation),
      author: args.author,
      payload: serializeUserDeviceV3(userDevice)
    }, args.blockSignatureKey);
  }

  makeNewUserBlock(args: NewUserParams) {
    if (!utils.equalArray(args.delegationToken.user_id, args.userId))
      throw new InvalidDelegationToken(`delegation token for user ${utils.toBase64(args.delegationToken.user_id)}, but we are ${utils.toBase64(args.userId)}`);
    const userKeys = tcrypto.makeEncryptionKeyPair();

    return this._makeDeviceBlock({
      ...args,
      author: this.trustchainId,
      ephemeralKey: args.delegationToken.ephemeral_public_signature_key,
      delegationSignature: args.delegationToken.delegation_signature,
      blockSignatureKey: args.delegationToken.ephemeral_private_signature_key,
      userKeys,
      isGhost: false });
  }

  makeNewDeviceBlock(args: NewDeviceParams): Block {
    const ephemeralKeys = tcrypto.makeSignKeyPair();
    const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, args.userId);

    return this._makeDeviceBlock({ ...args,
      author: this.deviceId,
      ephemeralKey: ephemeralKeys.publicKey,
      delegationSignature: tcrypto.sign(delegationBuffer, this.privateSignatureKey),
      blockSignatureKey: ephemeralKeys.privateKey,
    });
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

  makeKeyPublishBlock(publicEncryptionKey: Uint8Array, resourceKey: Uint8Array, resourceId: Uint8Array, nature: NatureKind): Block {
    const sharedKey = tcrypto.sealEncrypt(
      resourceKey,
      publicEncryptionKey,
    );

    const payload = {
      recipient: publicEncryptionKey,
      resourceId,
      key: sharedKey,
    };

    const pKeyBlock = signBlock(
      {
        index: 0,
        trustchain_id: this.trustchainId,
        nature: preferredNature(nature),
        author: this.deviceId,
        payload: serializeKeyPublish(payload)
      },
      this.privateSignatureKey
    );

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
