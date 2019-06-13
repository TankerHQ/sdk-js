// @flow

import { utils, tcrypto } from '@tanker/crypto';

import {
  serializeUserDeviceV3,
} from '../Blocks/payloads';

import { preferredNature, NATURE_KIND } from '../Blocks/Nature';

import { signBlock, hashBlock, type Block } from '../Blocks/Block';
import { type DelegationToken } from './UserData';

import { type DeviceKeys } from './KeySafe';
import { type GhostDevice, type GhostDeviceKeys } from './ghostDevice';

export type EncryptedUserKeyForGhostDevice = {
  deviceId: Uint8Array,
  encryptedPrivateUserKey: Uint8Array,
}

export type UserCreation = {
  ghostDevice: GhostDevice,
  encryptedUserKey: EncryptedUserKeyForGhostDevice,
  userCreationBlock: Block,
}

type MakeDeviceParams = {
  trustchainId: Uint8Array,
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

const makeDeviceBlock = (args: MakeDeviceParams) => {
  const encryptedUserKey = tcrypto.sealEncrypt(
    args.userKeys.privateKey,
    args.publicEncryptionKey,
  );
  const userDevice = {
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
    trustchain_id: args.trustchainId,
    nature: preferredNature(NATURE_KIND.device_creation),
    author: args.author,
    payload: serializeUserDeviceV3(userDevice)
  }, args.blockSignatureKey);
};

export const generateUserCreation = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  delegationToken: DelegationToken,
  ghostDeviceKeys: GhostDeviceKeys,
) => {
  const userKeys = tcrypto.makeEncryptionKeyPair();

  const userCreationBlock = makeDeviceBlock({
    trustchainId,
    userId,
    userKeys,
    author: trustchainId,
    ephemeralKey: delegationToken.ephemeral_public_signature_key,
    delegationSignature: delegationToken.delegation_signature,
    publicSignatureKey: ghostDeviceKeys.signatureKeyPair.publicKey,
    publicEncryptionKey: ghostDeviceKeys.encryptionKeyPair.publicKey,
    blockSignatureKey: delegationToken.ephemeral_private_signature_key,
    isGhost: true,
  });

  const encryptedUserKey = {
    publicUserKey: userKeys.publicKey,
    encryptedPrivateUserKey: tcrypto.sealEncrypt(userKeys.privateKey, ghostDeviceKeys.encryptionKeyPair.publicKey),
    deviceId: hashBlock(userCreationBlock)
  };

  return {
    userCreationBlock,
    ghostDevice: {
      privateSignatureKey: ghostDeviceKeys.signatureKeyPair.privateKey,
      privateEncryptionKey: ghostDeviceKeys.encryptionKeyPair.privateKey,
    },
    encryptedUserKey,
  };
};

export const generateDeviceFromGhostDevice = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  deviceKeys: DeviceKeys,
  ghostDevice: GhostDevice,
  encryptedUserKey: EncryptedUserKeyForGhostDevice,
) => {
  const ghostDeviceEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(ghostDevice.privateEncryptionKey);

  const decryptedUserPrivateKey = tcrypto.sealDecrypt(
    encryptedUserKey.encryptedPrivateUserKey,
    ghostDeviceEncryptionKeyPair
  );

  const userKeys = tcrypto.getEncryptionKeyPairFromPrivateKey(decryptedUserPrivateKey);

  const ephemeralKeys = tcrypto.makeSignKeyPair();
  const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, userId);

  const deviceBlock = makeDeviceBlock({
    trustchainId,
    userId,
    userKeys,
    author: encryptedUserKey.deviceId,
    ephemeralKey: ephemeralKeys.publicKey,
    delegationSignature: tcrypto.sign(delegationBuffer, ghostDevice.privateSignatureKey),
    publicSignatureKey: deviceKeys.signaturePair.publicKey,
    publicEncryptionKey: deviceKeys.encryptionPair.publicKey,
    blockSignatureKey: ephemeralKeys.privateKey,
    isGhost: false
  });
  return {
    deviceBlock,
    deviceId: hashBlock(deviceBlock)
  };
};
