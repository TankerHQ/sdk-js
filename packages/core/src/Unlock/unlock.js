// @flow

import { generichash, tcrypto, utils, type b64string, type safeb64string, type Key } from '@tanker/crypto';
import { type Block, hashBlock } from '../Blocks/Block';
import BlockGenerator from '../Blocks/BlockGenerator';
import * as EncryptorV2 from '../DataProtection/Encryptors/v2';

export type UnlockKey = b64string;

export type UnlockKeyRegistration = {|
  unlockKey: b64string,
  block: Block,
|};

export type GhostDevice = {
  deviceId: Uint8Array,
  privateSignatureKey: Uint8Array,
  privateEncryptionKey: Uint8Array,
}

export class UnlockKeyAnswer {
  _encryptedUnlockKey: Uint8Array;

  constructor(encUnlockKey: Uint8Array) {
    this._encryptedUnlockKey = encUnlockKey;
  }

  async getUnlockKey(userSecret: Key): Promise<UnlockKey> {
    return utils.toString(EncryptorV2.decrypt(userSecret, this._encryptedUnlockKey));
  }
}

export type UnlockClaims = {
  email?: Uint8Array,
  password?: Uint8Array,
  unlockKey?: Uint8Array,
}

export type UnlockKeyMessage = {
  trustchainId: b64string,
  deviceId: b64string,
  claims: UnlockClaims,
  signature: Uint8Array,
}

export type RegisterUnlockParams = {|
  password?: string,
  email?: string,
|}

export type UnlockKeyRequest = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  type: 'password' | 'verification_code',
  value: Uint8Array,
}

type CreateUnlockKeyMessageParams = {
  trustchainId: b64string,
  deviceId: b64string,
  password: ?string,
  unlockKey: ?b64string,
  email: ?string,
  userSecret: Key,
  privateSigKey: Key
}

type CreateUnlockRequestParams = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  password: ?string,
  verificationCode: ?safeb64string,
}

export function createUnlockKeyRequest({
  trustchainId,
  userId,
  password,
  verificationCode
}: CreateUnlockRequestParams): UnlockKeyRequest {
  const msg = () => {
    if (password) {
      return {
        type: 'password',
        value: generichash(utils.fromString(password)),
      };
    } else if (verificationCode) {
      return {
        type: 'verification_code',
        value: utils.fromSafeBase64(verificationCode),
      };
    } else {
      throw new Error('wrong unlock request type provided');
    }
  };
  return {
    trustchainId,
    userId,
    ...msg(),
  };
}

export function ghostDeviceToUnlockKey(ghostDevice: GhostDevice): UnlockKey {
  return utils.toB64Json({
    deviceId: utils.toBase64(ghostDevice.deviceId),
    privateSignatureKey: utils.toBase64(ghostDevice.privateSignatureKey),
    privateEncryptionKey: utils.toBase64(ghostDevice.privateEncryptionKey),
  });
}

export function getSignData(message: UnlockKeyMessage): Uint8Array {
  let buff = utils.concatArrays(utils.fromBase64(message.trustchainId), utils.fromBase64(message.deviceId));
  if (message.claims.email)
    buff = utils.concatArrays(buff, message.claims.email);
  if (message.claims.password)
    buff = utils.concatArrays(buff, message.claims.password);
  if (message.claims.unlockKey)
    buff = utils.concatArrays(buff, message.claims.unlockKey);
  return buff;
}

export async function createUnlockKeyMessage({
  trustchainId,
  deviceId,
  email,
  password,
  unlockKey,
  userSecret,
  privateSigKey
}: CreateUnlockKeyMessageParams): Promise<UnlockKeyMessage> {
  const message = {
    trustchainId,
    deviceId,
    claims: {},
    signature: new Uint8Array(0)
  };
  if (email)
    message.claims.email = utils.fromString(email);
  if (password)
    message.claims.password = generichash(utils.fromString(password));
  if (unlockKey)
    message.claims.unlockKey = EncryptorV2.encrypt(userSecret, utils.fromString(unlockKey));

  const buff = getSignData(message);
  message.signature = tcrypto.sign(buff, privateSigKey);
  return message;
}

type AuthorDevice = {
  id: Uint8Array,
  privateSignatureKey: Key,
};

type GenerateUnlockKeyRegistrationArg = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  userKeys: tcrypto.SodiumKeyPair,
  authorDevice: AuthorDevice,
};

export function generateUnlockKeyRegistration({
  trustchainId,
  userId,
  userKeys,
  authorDevice,
}: GenerateUnlockKeyRegistrationArg): UnlockKeyRegistration {
  const ghostEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
  const ghostSignatureKeyPair = tcrypto.makeSignKeyPair();

  const blockGenerator = new BlockGenerator(
    trustchainId,
    authorDevice.privateSignatureKey,
    authorDevice.id,
  );

  const newDeviceBlock = blockGenerator.makeNewDeviceBlock({
    userId,
    userKeys,
    publicSignatureKey: ghostSignatureKeyPair.publicKey,
    publicEncryptionKey: ghostEncryptionKeyPair.publicKey,
    isGhost: true,
  });

  const ghostDeviceId = hashBlock(newDeviceBlock);

  const unlockKey = ghostDeviceToUnlockKey({
    deviceId: ghostDeviceId,
    privateSignatureKey: ghostSignatureKeyPair.privateKey,
    privateEncryptionKey: ghostEncryptionKeyPair.privateKey,
  });

  return {
    unlockKey,
    block: newDeviceBlock,
  };
}
