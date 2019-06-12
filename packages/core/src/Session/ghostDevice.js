// @flow

import { utils, tcrypto, type b64string } from '@tanker/crypto';

import { encrypt, decrypt } from '../DataProtection/Encryptors/v2';

import { InvalidVerificationKey } from '../errors';

export type GhostDevice = {
  privateEncryptionKey: Uint8Array,
  privateSignatureKey: Uint8Array,
}
export type GhostDeviceKeys = {
  encryptionKeyPair: tcrypto.SodiumKeyPair,
  signatureKeyPair: tcrypto.SodiumKeyPair,
}

export const generateGhostDeviceKeys = (): GhostDeviceKeys => ({
  encryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
  signatureKeyPair: tcrypto.makeSignKeyPair(),
});

export const extractGhostDevice = (unlockKey: b64string): GhostDevice => {
  try {
    const decoded = utils.fromB64Json(unlockKey);
    return {
      privateEncryptionKey: utils.fromBase64(decoded.privateEncryptionKey),
      privateSignatureKey: utils.fromBase64(decoded.privateSignatureKey),
    };
  } catch (e) {
    throw new InvalidVerificationKey(e);
  }
};

export const decryptUnlockKey = (encryptedUnlockKey: Uint8Array, userSecret: Uint8Array) => utils.toString(decrypt(userSecret, encryptedUnlockKey));

export const ghostDeviceToUnlockKey = (ghostDevice: GhostDevice) => utils.toB64Json({
  privateEncryptionKey: utils.toBase64(ghostDevice.privateEncryptionKey),
  privateSignatureKey: utils.toBase64(ghostDevice.privateSignatureKey),
});

export const ghostDeviceToEncryptedUnlockKey = (ghostDevice: GhostDevice, userSecret: Uint8Array) => encrypt(userSecret, utils.fromString(ghostDeviceToUnlockKey(ghostDevice)));

export const ghostDeviceKeysFromUnlockKey = (unlockKey: b64string): GhostDeviceKeys => {
  const ghostDevice = extractGhostDevice(unlockKey);
  return {
    encryptionKeyPair: tcrypto.getEncryptionKeyPairFromPrivateKey(ghostDevice.privateEncryptionKey),
    signatureKeyPair: tcrypto.getSignatureKeyPairFromPrivateKey(ghostDevice.privateSignatureKey),
  };
};
