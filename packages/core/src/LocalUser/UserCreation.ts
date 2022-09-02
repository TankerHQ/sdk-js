import { tcrypto, utils } from '@tanker/crypto';

import { serializeUserDeviceV3 } from '../Users/Serialize';

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

export const generateGhostDevice = (
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

  return {
    userKeys,
    block,
    hash,
    ghostDevice,
  };
};

export const generateUserCreation = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  ghostDeviceKeys: GhostDeviceKeys,
  delegationToken: DelegationToken,
) => {
  const { block, hash, ghostDevice, userKeys } = generateGhostDevice(trustchainId, userId, ghostDeviceKeys, delegationToken);
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
    userKeys,
  };
};
