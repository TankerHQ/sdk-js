// @flow

import { tcrypto, utils } from '@tanker/crypto';

import { serializeUserDeviceV3 } from '../../Users/Serialize';

import { preferredNature, NATURE_KIND } from '../../Blocks/Nature';
import { createBlock, hashBlock } from '../../Blocks/Block';
import { unserializeBlock } from '../../Blocks/payloads';

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

  const block = createBlock(
    serializeUserDeviceV3(userDevice),
    preferredNature(NATURE_KIND.device_creation),
    args.trustchainId,
    args.author,
    args.blockSignatureKey
  );
  const deviceId = hashBlock(unserializeBlock(utils.fromBase64(block)));

  return { deviceBlock: block, deviceId };
};
