// @flow

import { tcrypto, utils } from '@tanker/crypto';

import { serializeUserDeviceV3,
  type UserKeys,
  serializeDeviceRevocationV2
} from '../Users/Serialize';

import { type User, type Device } from '../Users/types';

import { preferredNature, NATURE_KIND } from '../Blocks/Nature';
import { createBlock } from '../Blocks/Block';

import { type GhostDevice, type GhostDeviceKeys } from './ghostDevice';
import { type DelegationToken } from './UserData';

export const generateDeviceFromGhostDevice = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  deviceEncryptionKeyPair: tcrypto.SodiumKeyPair,
  deviceSignatureKeyPair: tcrypto.SodiumKeyPair,
  ghostDevice: GhostDevice,
  ghostDeviceId: Uint8Array,
  userKeys: tcrypto.SodiumKeyPair,
) => {
  const ephemeralKeys = tcrypto.makeSignKeyPair();
  const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, userId);

  const encryptedUserKeyForNewDevice = tcrypto.sealEncrypt(
    userKeys.privateKey,
    deviceEncryptionKeyPair.publicKey
  );

  const payload = serializeUserDeviceV3({
    ephemeral_public_signature_key: ephemeralKeys.publicKey,
    user_id: userId,
    delegation_signature: tcrypto.sign(delegationBuffer, ghostDevice.privateSignatureKey),
    public_signature_key: deviceSignatureKeyPair.publicKey,
    public_encryption_key: deviceEncryptionKeyPair.publicKey,
    last_reset: new Uint8Array(tcrypto.HASH_SIZE),
    user_key_pair: {
      public_encryption_key: userKeys.publicKey,
      encrypted_private_encryption_key: encryptedUserKeyForNewDevice,
    },
    is_ghost_device: false,
    revoked: Number.MAX_SAFE_INTEGER,
  });

  return createBlock(
    payload,
    preferredNature(NATURE_KIND.device_creation),
    trustchainId,
    ghostDeviceId,
    ephemeralKeys.privateKey
  ).block;
};

export const generateUserCreation = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  deviceEncryptionKeyPair: tcrypto.SodiumKeyPair,
  deviceSignatureKeyPair: tcrypto.SodiumKeyPair,
  ghostDeviceKeys: GhostDeviceKeys,
  delegationToken: DelegationToken
) => {
  const userKeys = tcrypto.makeEncryptionKeyPair();
  const encryptedUserKey = tcrypto.sealEncrypt(
    userKeys.privateKey,
    ghostDeviceKeys.encryptionKeyPair.publicKey,
  );

  const ghostDevicePayload = serializeUserDeviceV3({
    ephemeral_public_signature_key: delegationToken.ephemeral_public_signature_key,
    user_id: userId,
    delegation_signature: delegationToken.delegation_signature,
    public_signature_key: ghostDeviceKeys.signatureKeyPair.publicKey,
    public_encryption_key: ghostDeviceKeys.encryptionKeyPair.publicKey,
    last_reset: new Uint8Array(tcrypto.HASH_SIZE),
    user_key_pair: {
      public_encryption_key: userKeys.publicKey,
      encrypted_private_encryption_key: encryptedUserKey,
    },
    is_ghost_device: true,
    revoked: Number.MAX_SAFE_INTEGER,
  });

  const { block, hash } = createBlock(
    ghostDevicePayload,
    preferredNature(NATURE_KIND.device_creation),
    trustchainId,
    trustchainId,
    delegationToken.ephemeral_private_signature_key
  );

  const ghostDevice = {
    privateSignatureKey: ghostDeviceKeys.signatureKeyPair.privateKey,
    privateEncryptionKey: ghostDeviceKeys.encryptionKeyPair.privateKey,
  };

  const firstDeviceBlock = generateDeviceFromGhostDevice(
    trustchainId,
    userId,
    deviceEncryptionKeyPair,
    deviceSignatureKeyPair,
    ghostDevice,
    hash,
    userKeys
  );

  return {
    userCreationBlock: block,
    firstDeviceBlock,
    ghostDevice,
  };
};


const rotateUserKeys = (devices: Array<Device>, currentUserKey: tcrypto.SodiumKeyPair): UserKeys => {
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
};

export const makeDeviceRevocation = (user: User, currentUserKeys: tcrypto.SodiumKeyPair, deviceId: Uint8Array) => {
  const remainingDevices = user.devices
    .filter(device => device.revokedAt === Number.MAX_SAFE_INTEGER && !utils.equalArray(device.deviceId, deviceId));

  const userKeys = rotateUserKeys(remainingDevices, currentUserKeys);
  const revocationRecord = {
    device_id: deviceId,
    user_keys: userKeys
  };

  return { payload: serializeDeviceRevocationV2(revocationRecord), nature: preferredNature(NATURE_KIND.device_revocation) };
};
