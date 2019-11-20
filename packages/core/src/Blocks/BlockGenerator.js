// @flow

import { tcrypto, utils, type Key, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import { type PublicProvisionalUser, type ProvisionalUserKeys } from '@tanker/identity';

import {
  serializeProvisionalIdentityClaim,
} from './payloads';

import {
  type DeviceCreationRecord,
  type UserKeys,
  serializeUserDeviceV3,
  serializeDeviceRevocationV2
} from '../Users/Serialize';

import {
  type UserGroupCreationRecordV1,
  type UserGroupCreationRecordV2,
  type UserGroupAdditionRecordV1,
  type UserGroupAdditionRecordV2,
  serializeUserGroupCreationV2,
  serializeUserGroupAdditionV2,
} from '../Groups/Serialize';

import { preferredNature, type NatureKind, NATURE_KIND } from './Nature';
import { serializeKeyPublish } from '../DataProtection/Resource/keyPublish';

import { signBlock, type Block } from './Block';
import { type DelegationToken } from '../Session/UserData';
import { getLastUserPublicKey, type User, type Device } from '../Users/types';

export function getUserGroupCreationBlockSignDataV1(record: UserGroupCreationRecordV1): Uint8Array {
  return utils.concatArrays(
    record.public_signature_key,
    record.public_encryption_key,
    record.encrypted_group_private_signature_key,
    ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key))
  );
}

export function getUserGroupCreationBlockSignDataV2(record: UserGroupCreationRecordV2): Uint8Array {
  return utils.concatArrays(
    record.public_signature_key,
    record.public_encryption_key,
    record.encrypted_group_private_signature_key,
    ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
      gek.user_id,
      gek.public_user_encryption_key,
      gek.encrypted_group_private_encryption_key
    )),
    ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
      gek.app_provisional_user_public_signature_key,
      gek.tanker_provisional_user_public_signature_key,
      gek.encrypted_group_private_encryption_key
    ))
  );
}

export function getUserGroupAdditionBlockSignDataV1(record: UserGroupAdditionRecordV1): Uint8Array {
  return utils.concatArrays(
    record.group_id,
    record.previous_group_block,
    ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(gek.public_user_encryption_key, gek.encrypted_group_private_encryption_key))
  );
}

export function getUserGroupAdditionBlockSignDataV2(record: UserGroupAdditionRecordV2): Uint8Array {
  return utils.concatArrays(
    record.group_id,
    record.previous_group_block,
    ...record.encrypted_group_private_encryption_keys_for_users.map(gek => utils.concatArrays(
      gek.user_id,
      gek.public_user_encryption_key,
      gek.encrypted_group_private_encryption_key
    )),
    ...record.encrypted_group_private_encryption_keys_for_provisional_users.map(gek => utils.concatArrays(
      gek.app_provisional_user_public_signature_key,
      gek.tanker_provisional_user_public_signature_key,
      gek.encrypted_group_private_encryption_key
    ))
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
    const userDevice: DeviceCreationRecord = {
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
        recipient: device.deviceId,
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

  makeDeviceRevocationBlock(user: User, currentUserKeys: tcrypto.SodiumKeyPair, deviceId: b64string) {
    const deviceIdToRevoke = utils.fromBase64(deviceId);
    const remainingDevices = user.devices
      .filter(device => device.revokedAt === Number.MAX_SAFE_INTEGER && !utils.equalArray(device.deviceId, deviceIdToRevoke));

    const userKeys = this._rotateUserKeys(remainingDevices, currentUserKeys);
    const revocationRecord = {
      device_id: deviceIdToRevoke,
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

  makeKeyPublishToProvisionalUserBlock(publicProvisionalUser: PublicProvisionalUser, resourceKey: Uint8Array, resourceId: Uint8Array): Block {
    const preEncryptedKey = tcrypto.sealEncrypt(
      resourceKey,
      publicProvisionalUser.appEncryptionPublicKey,
    );
    const encryptedKey = tcrypto.sealEncrypt(
      preEncryptedKey,
      publicProvisionalUser.tankerEncryptionPublicKey,
    );

    const payload = {
      recipient: utils.concatArrays(publicProvisionalUser.appSignaturePublicKey, publicProvisionalUser.tankerSignaturePublicKey),
      resourceId,
      key: encryptedKey,
    };

    const pKeyBlock = signBlock(
      {
        index: 0,
        trustchain_id: this.trustchainId,
        nature: preferredNature(NATURE_KIND.key_publish_to_provisional_user),
        author: this.deviceId,
        payload: serializeKeyPublish(payload)
      },
      this.privateSignatureKey
    );

    return pKeyBlock;
  }

  createUserGroup(signatureKeyPair: tcrypto.SodiumKeyPair, encryptionKeyPair: tcrypto.SodiumKeyPair, users: Array<User>, provisionalUsers: Array<PublicProvisionalUser>): Block {
    const encryptedPrivateSignatureKey = tcrypto.sealEncrypt(signatureKeyPair.privateKey, encryptionKeyPair.publicKey);

    const keysForUsers = users.map(u => {
      const userPublicKey = getLastUserPublicKey(u);
      if (!userPublicKey)
        throw new InternalError('createUserGroup: user does not have user keys');
      return {
        user_id: u.userId,
        public_user_encryption_key: userPublicKey,
        encrypted_group_private_encryption_key: tcrypto.sealEncrypt(encryptionKeyPair.privateKey, userPublicKey),
      };
    });

    const keysForProvisionalUsers = provisionalUsers.map(u => {
      const preEncryptedKey = tcrypto.sealEncrypt(
        encryptionKeyPair.privateKey,
        u.appEncryptionPublicKey,
      );
      const encryptedKey = tcrypto.sealEncrypt(
        preEncryptedKey,
        u.tankerEncryptionPublicKey,
      );
      return {
        app_provisional_user_public_signature_key: u.appSignaturePublicKey,
        tanker_provisional_user_public_signature_key: u.tankerSignaturePublicKey,
        encrypted_group_private_encryption_key: encryptedKey,
      };
    });

    const payload = {
      public_signature_key: signatureKeyPair.publicKey,
      public_encryption_key: encryptionKeyPair.publicKey,
      encrypted_group_private_signature_key: encryptedPrivateSignatureKey,
      encrypted_group_private_encryption_keys_for_users: keysForUsers,
      encrypted_group_private_encryption_keys_for_provisional_users: keysForProvisionalUsers,
      self_signature: new Uint8Array(0),
    };

    const signData = getUserGroupCreationBlockSignDataV2(payload);
    payload.self_signature = tcrypto.sign(signData, signatureKeyPair.privateKey);

    const block = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.user_group_creation),
      author: this.deviceId,
      payload: serializeUserGroupCreationV2(payload)
    }, this.privateSignatureKey);

    return block;
  }

  addToUserGroup(groupId: Uint8Array, privateSignatureKey: Uint8Array, previousGroupBlock: Uint8Array, privateEncryptionKey: Uint8Array, users: Array<User>, provisionalUsers: Array<PublicProvisionalUser>): Block {
    const keysForUsers = users.map(u => {
      const userPublicKey = getLastUserPublicKey(u);
      if (!userPublicKey)
        throw new InternalError('addToUserGroup: user does not have user keys');
      return {
        user_id: u.userId,
        public_user_encryption_key: userPublicKey,
        encrypted_group_private_encryption_key: tcrypto.sealEncrypt(privateEncryptionKey, userPublicKey),
      };
    });

    const keysForProvisionalUsers = provisionalUsers.map(u => {
      const preEncryptedKey = tcrypto.sealEncrypt(
        privateEncryptionKey,
        u.appEncryptionPublicKey,
      );
      const encryptedKey = tcrypto.sealEncrypt(
        preEncryptedKey,
        u.tankerEncryptionPublicKey,
      );
      return {
        app_provisional_user_public_signature_key: u.appSignaturePublicKey,
        tanker_provisional_user_public_signature_key: u.tankerSignaturePublicKey,
        encrypted_group_private_encryption_key: encryptedKey,
      };
    });

    const payload = {
      group_id: groupId,
      previous_group_block: previousGroupBlock,
      encrypted_group_private_encryption_keys_for_users: keysForUsers,
      encrypted_group_private_encryption_keys_for_provisional_users: keysForProvisionalUsers,
      self_signature_with_current_key: new Uint8Array(0),
    };

    const signData = getUserGroupAdditionBlockSignDataV2(payload);
    payload.self_signature_with_current_key = tcrypto.sign(signData, privateSignatureKey);

    const block = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.user_group_addition),
      author: this.deviceId,
      payload: serializeUserGroupAdditionV2(payload)
    }, this.privateSignatureKey);

    return block;
  }

  makeProvisionalIdentityClaimBlock(userId: Uint8Array, userPublicKey: Uint8Array, provisionalUserKeys: ProvisionalUserKeys): Block {
    const multiSignedPayload = utils.concatArrays(
      this.deviceId,
      provisionalUserKeys.appSignatureKeyPair.publicKey,
      provisionalUserKeys.tankerSignatureKeyPair.publicKey,
    );
    const appSignature = tcrypto.sign(multiSignedPayload, provisionalUserKeys.appSignatureKeyPair.privateKey);
    const tankerSignature = tcrypto.sign(multiSignedPayload, provisionalUserKeys.tankerSignatureKeyPair.privateKey);

    const keysToEncrypt = utils.concatArrays(provisionalUserKeys.appEncryptionKeyPair.privateKey, provisionalUserKeys.tankerEncryptionKeyPair.privateKey);
    const encryptedprovisionalUserKeys = tcrypto.sealEncrypt(keysToEncrypt, userPublicKey);

    const payload = {
      user_id: userId,
      app_provisional_identity_signature_public_key: provisionalUserKeys.appSignatureKeyPair.publicKey,
      tanker_provisional_identity_signature_public_key: provisionalUserKeys.tankerSignatureKeyPair.publicKey,
      author_signature_by_app_key: appSignature,
      author_signature_by_tanker_key: tankerSignature,
      recipient_user_public_key: userPublicKey,
      encrypted_provisional_identity_private_keys: encryptedprovisionalUserKeys,
    };

    const block = signBlock({
      index: 0,
      trustchain_id: this.trustchainId,
      nature: preferredNature(NATURE_KIND.provisional_identity_claim),
      author: this.deviceId,
      payload: serializeProvisionalIdentityClaim(payload)
    }, this.privateSignatureKey);
    return block;
  }
}

export default BlockGenerator;
