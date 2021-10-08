import { tcrypto, utils } from '@tanker/crypto';
import { InvalidArgument, PreconditionFailed } from '@tanker/errors';

import type { UserKeys } from '../Users/Serialize';
import { serializeUserDeviceV3, serializeDeviceRevocationV2 } from '../Users/Serialize';

import type { Device } from '../Users/types';

import { preferredNature, NATURE_KIND } from '../Blocks/Nature';
import { createBlock } from '../Blocks/Block';
import type { GhostDevice, GhostDeviceKeys } from './ghostDevice';
import type { DelegationToken } from './UserData';

export const generateDeviceFromGhostDevice = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  ghostDevice: GhostDevice,
  ghostDeviceId: Uint8Array,
  userKeys: tcrypto.SodiumKeyPair,
) => {
  const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();
  const signatureKeyPair = tcrypto.makeSignKeyPair();
  const ephemeralKeys = tcrypto.makeSignKeyPair();
  const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, userId);

  const encryptedUserKeyForNewDevice = tcrypto.sealEncrypt(
    userKeys.privateKey,
    encryptionKeyPair.publicKey,
  );

  const payload = serializeUserDeviceV3({
    ephemeral_public_signature_key: ephemeralKeys.publicKey,
    user_id: userId,
    delegation_signature: tcrypto.sign(delegationBuffer, ghostDevice.privateSignatureKey),
    public_signature_key: signatureKeyPair.publicKey,
    public_encryption_key: encryptionKeyPair.publicKey,
    last_reset: new Uint8Array(tcrypto.HASH_SIZE),
    user_key_pair: {
      public_encryption_key: userKeys.publicKey,
      encrypted_private_encryption_key: encryptedUserKeyForNewDevice,
    },
    is_ghost_device: false,
    revoked: Number.MAX_SAFE_INTEGER,
  });
  return {
    ...createBlock(
      payload,
      preferredNature(NATURE_KIND.device_creation),
      trustchainId,
      ghostDeviceId,
      ephemeralKeys.privateKey,
    ),
    encryptionKeyPair,
    signatureKeyPair,
  };
};

export const generateUserCreation = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  ghostDeviceKeys: GhostDeviceKeys,
  delegationToken: DelegationToken,
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
    delegationToken.ephemeral_private_signature_key,
  );

  const ghostDevice = {
    privateSignatureKey: ghostDeviceKeys.signatureKeyPair.privateKey,
    privateEncryptionKey: ghostDeviceKeys.encryptionKeyPair.privateKey,
  };

  const firstDevice = generateDeviceFromGhostDevice(
    trustchainId,
    userId,
    ghostDevice,
    hash,
    userKeys,
  );

  return {
    userCreationBlock: block,
    firstDeviceId: firstDevice.hash,
    firstDeviceBlock: firstDevice.block,
    firstDeviceEncryptionKeyPair: firstDevice.encryptionKeyPair,
    firstDeviceSignatureKeyPair: firstDevice.signatureKeyPair,
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

export const makeDeviceRevocation = (devices: Array<Device>, currentUserKeys: tcrypto.SodiumKeyPair, deviceId: Uint8Array) => {
  const remainingDevices: Array<Device> = [];
  let deviceToRevokeFound = false;
  let deviceAlreadyRevoked = false;

  devices.forEach(device => {
    if (utils.equalArray(device.deviceId, deviceId)) {
      deviceToRevokeFound = true;
      deviceAlreadyRevoked = device.revoked;
    } else if (!device.revoked) {
      remainingDevices.push(device);
    }
  });

  if (!deviceToRevokeFound) {
    throw new InvalidArgument('The deviceId provided does not match one of your devices');
  }
  if (deviceAlreadyRevoked) {
    throw new PreconditionFailed('The deviceId provided targets a device which is already revoked');
  }

  const userKeys = rotateUserKeys(remainingDevices, currentUserKeys);
  const revocationRecord = {
    device_id: deviceId,
    user_keys: userKeys,
  };

  return { payload: serializeDeviceRevocationV2(revocationRecord), nature: preferredNature(NATURE_KIND.device_revocation) };
};
