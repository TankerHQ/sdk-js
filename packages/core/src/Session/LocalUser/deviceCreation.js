// @flow

import { tcrypto } from '@tanker/crypto';

import { serializeUserDeviceV3 } from '../../Users/Serialize';

import { preferredNature, NATURE_KIND } from '../../Blocks/Nature';

import { signBlock, hashBlock } from '../../Blocks/Block';

export type EncryptedUserKeyForGhostDevice = {
  deviceId: Uint8Array,
  encryptedPrivateUserKey: Uint8Array,
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

export const makeDeviceBlock = (args: MakeDeviceParams) => {
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

  const deviceBlock = signBlock({
    index: 0,
    trustchain_id: args.trustchainId,
    nature: preferredNature(NATURE_KIND.device_creation),
    author: args.author,
    payload: serializeUserDeviceV3(userDevice)
  }, args.blockSignatureKey);

  const deviceId = hashBlock(deviceBlock);
  return { deviceBlock, deviceId };
};
