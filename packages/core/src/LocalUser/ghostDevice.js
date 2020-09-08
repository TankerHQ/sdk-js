// @flow
import { utils, tcrypto, encryptionV2, type b64string } from '@tanker/crypto';
import { DecryptionFailed } from '@tanker/errors';

export type GhostDevice = {
  privateEncryptionKey: Uint8Array,
  privateSignatureKey: Uint8Array,
}
export type GhostDeviceKeys = {
  encryptionKeyPair: tcrypto.SodiumKeyPair,
  signatureKeyPair: tcrypto.SodiumKeyPair,
}

type EncryptedUserKeyForGhostDevice = {
  deviceId: Uint8Array,
  encryptedPrivateUserKey: Uint8Array,
};

export const generateGhostDeviceKeys = (): GhostDeviceKeys => ({
  encryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
  signatureKeyPair: tcrypto.makeSignKeyPair(),
});

export const extractGhostDevice = (verificationKey: b64string): GhostDevice => {
  const decoded = utils.fromB64Json(verificationKey);
  return {
    privateEncryptionKey: utils.fromBase64(decoded.privateEncryptionKey),
    privateSignatureKey: utils.fromBase64(decoded.privateSignatureKey),
  };
};

export const decryptVerificationKey = (encryptedVerificationKey: Uint8Array, userSecret: Uint8Array) => {
  if (encryptedVerificationKey.length < encryptionV2.overhead) {
    throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${encryptionV2.overhead} for encryption v2` });
  }

  return utils.toString(encryptionV2.compatDecrypt(userSecret, encryptedVerificationKey));
};

export const ghostDeviceToVerificationKey = (ghostDevice: GhostDevice) => utils.toB64Json({
  privateEncryptionKey: utils.toBase64(ghostDevice.privateEncryptionKey),
  privateSignatureKey: utils.toBase64(ghostDevice.privateSignatureKey),
});

export const ghostDeviceToEncryptedVerificationKey = (ghostDevice: GhostDevice, userSecret: Uint8Array) => encryptionV2.compatEncrypt(userSecret, utils.fromString(ghostDeviceToVerificationKey(ghostDevice)));

export const ghostDeviceKeysFromVerificationKey = (verificationKey: b64string): GhostDeviceKeys => {
  const ghostDevice = extractGhostDevice(verificationKey);
  return {
    encryptionKeyPair: tcrypto.getEncryptionKeyPairFromPrivateKey(ghostDevice.privateEncryptionKey),
    signatureKeyPair: tcrypto.getSignatureKeyPairFromPrivateKey(ghostDevice.privateSignatureKey),
  };
};

export const decryptUserKeyForGhostDevice = (ghostDevice: GhostDevice, encryptedUserKey: EncryptedUserKeyForGhostDevice) => {
  const ghostDeviceEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(ghostDevice.privateEncryptionKey);

  const decryptedUserPrivateKey = tcrypto.sealDecrypt(
    encryptedUserKey.encryptedPrivateUserKey,
    ghostDeviceEncryptionKeyPair
  );

  return tcrypto.getEncryptionKeyPairFromPrivateKey(decryptedUserPrivateKey);
};
