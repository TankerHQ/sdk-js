// @flow

import { utils, tcrypto, type b64string } from '@tanker/crypto';
import { InvalidUnlockKey } from '../errors';
import { type EncryptedUserKey } from '../Network/Client';
import BlockGenerator from '../Blocks/BlockGenerator';
import { type DeviceKeys } from './LocalUser';

type GhostDevice = {
  deviceId: Uint8Array,
  privateSignatureKey: Uint8Array,
  privateEncryptionKey: Uint8Array,
}

export const extractGhostDevice = (unlockKey: b64string) => {
  try {
    const decoded = utils.fromB64Json(unlockKey);
    return {
      deviceId: utils.fromBase64(decoded.deviceId),
      privateSignatureKey: utils.fromBase64(decoded.privateSignatureKey),
      privateEncryptionKey: utils.fromBase64(decoded.privateEncryptionKey),
    };
  } catch (e) {
    throw new InvalidUnlockKey(e);
  }
};

export const createDeviceBlockFromGhostDevice = (
  trustchainId: Uint8Array,
  userId: Uint8Array,
  deviceKeys: DeviceKeys,
  ghostDevice: GhostDevice,
  encryptedUserKey: EncryptedUserKey,
) => {
  const ghostDeviceEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(ghostDevice.privateEncryptionKey);

  const decryptedUserPrivateKey = tcrypto.sealDecrypt(
    encryptedUserKey.encrypted_private_user_key,
    ghostDeviceEncryptionKeyPair
  );

  const userKeys = {
    publicKey: encryptedUserKey.public_user_key,
    privateKey: decryptedUserPrivateKey
  };

  const blockGenerator = new BlockGenerator(
    trustchainId,
    ghostDevice.privateSignatureKey,
    ghostDevice.deviceId
  );
  return blockGenerator.makeNewDeviceBlock({
    userId,
    userKeys,
    publicSignatureKey: deviceKeys.signaturePair.publicKey,
    publicEncryptionKey: deviceKeys.encryptionPair.publicKey,
    isGhost: false,
  });
};
