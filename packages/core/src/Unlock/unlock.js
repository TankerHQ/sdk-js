// @flow

import { aead, tcrypto, generichash, utils, type b64string, type safeb64string, type Key } from '@tanker/crypto';
import { InvalidDeviceValidationCode, InvalidUnlockKey } from '../errors';
import { type UserDeviceRecord } from '../Blocks/payloads';
import { type Block, hashBlock } from '../Blocks/Block';
import BlockGenerator from '../Blocks/BlockGenerator';
import type { EncryptedUserKey } from '../Network/Client';
import { type DeviceKeys } from '../Session/KeySafe';

export type UnlockKey = b64string;

export type UnlockKeyRegistration = {|
  unlockKey: b64string,
  block: Block,
|};

export const DEVICE_TYPE = Object.freeze({
  client_device: 1,
  server_device: 2,
});

export type DeviceType = $Values<typeof DEVICE_TYPE>;


export type UnlockDeviceParams = {|
  unlockKey?: UnlockKey,
  password?: string,
  verificationCode?: string,
|}

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

  get encryptedUnlockKey(): Uint8Array {
    return this._encryptedUnlockKey;
  }

  async getUnlockKey(userSecret: Key): Promise<UnlockKey> {
    return utils.toString(await aead.decryptAEADv2(userSecret, this._encryptedUnlockKey));
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

export type SetupUnlockParams = {|
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
    message.claims.unlockKey = await aead.encryptAEADv2(userSecret, utils.fromString(unlockKey));

  const buff = getSignData(message);
  message.signature = tcrypto.sign(buff, privateSigKey);
  return message;
}

type CreateDevCodeParams = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  deviceKeys: DeviceKeys,
  userKeys: tcrypto.SodiumKeyPair,
  validationCode: b64string
}

export function createDeviceFromValidationCode({
  trustchainId,
  userId,
  deviceKeys,
  userKeys,
  validationCode
}: CreateDevCodeParams): Block {
  let code;
  try {
    code = utils.fromB64Json(validationCode);
    const codeUserId = utils.fromBase64(code.userId);
    if (!utils.equalArray(codeUserId, userId))
      throw new Error(`Expecting userId ${utils.toBase64(userId)}, got ${utils.toBase64(codeUserId)}`);
    if (!code.keyS || !code.keyC)
      throw new Error('Key not found in validation code');
  } catch (e) {
    throw new InvalidDeviceValidationCode(e);
  }

  const encryptedUserKey = tcrypto.sealEncrypt(
    userKeys.privateKey,
    utils.fromBase64(code.keyC),
  );

  const device: UserDeviceRecord = {
    ephemeral_public_signature_key: new Uint8Array(0),
    user_id: userId,
    delegation_signature: new Uint8Array(0),
    public_signature_key: utils.fromBase64(code.keyS),
    public_encryption_key: utils.fromBase64(code.keyC),
    last_reset: new Uint8Array(tcrypto.HASH_SIZE),
    user_key_pair: {
      public_encryption_key: userKeys.publicKey,
      encrypted_private_encryption_key: encryptedUserKey,
    },
    is_ghost_device: false,
    // device validation code is reserved to clients
    is_server_device: false,
    revoked: Number.MAX_SAFE_INTEGER,
  };

  const blockGenerator = new BlockGenerator(
    trustchainId,
    deviceKeys.signaturePair.privateKey,
    // $FlowIssue
    utils.fromBase64(deviceKeys.deviceId)
  );

  return blockGenerator.addDevice(device);
}

export function extractUnlockKey(unlockKey: b64string): GhostDevice {
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
}

type CreateDevUnlockArgV3 = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  deviceKeys: DeviceKeys,
  ghostDevice: GhostDevice,
  encryptedUserKey: EncryptedUserKey,
  deviceType: DeviceType,
}

type CreateDevUnlockArg = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  deviceKeys: DeviceKeys,
  ghostDevice: GhostDevice,
  encryptedUserKey: ?EncryptedUserKey,
  deviceType?: DeviceType,
}

type AuthorDevice = {
  id: Uint8Array,
  privateSignatureKey: Key,
};

type GenerateUnlockKeyRegistrationArg = {
  trustchainId: Uint8Array,
  userId: Uint8Array,
  userKeys: tcrypto.SodiumKeyPair,
  deviceType: DeviceType,
  authorDevice: AuthorDevice,
};

function createDeviceFromUnlockKeyV3({
  trustchainId,
  userId,
  deviceKeys,
  ghostDevice,
  encryptedUserKey,
  deviceType,
}: CreateDevUnlockArgV3): Block {
  const ghostDeviceEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(ghostDevice.privateEncryptionKey);

  const decryptedUserPrivateKey = tcrypto.sealDecrypt(
    encryptedUserKey.encrypted_private_user_key,
    ghostDeviceEncryptionKeyPair
  );

  const reencryptedUserPrivateKey = tcrypto.sealEncrypt(
    decryptedUserPrivateKey,
    deviceKeys.encryptionPair.publicKey,
  );
  const device: UserDeviceRecord = {
    ephemeral_public_signature_key: new Uint8Array(0),
    user_id: userId,
    delegation_signature: new Uint8Array(0),
    public_signature_key: deviceKeys.signaturePair.publicKey,
    public_encryption_key: deviceKeys.encryptionPair.publicKey,
    last_reset: new Uint8Array(tcrypto.HASH_SIZE),
    user_key_pair: {
      public_encryption_key: encryptedUserKey.public_user_key,
      encrypted_private_encryption_key: reencryptedUserPrivateKey,
    },
    is_ghost_device: false,
    is_server_device: (deviceType === DEVICE_TYPE.server_device),
    revoked: Number.MAX_SAFE_INTEGER,
  };

  const blockGenerator = new BlockGenerator(
    trustchainId,
    ghostDevice.privateSignatureKey,
    ghostDevice.deviceId
  );

  return blockGenerator.addDevice(device);
}

export function generateUnlockKeyRegistration({
  trustchainId,
  userId,
  userKeys,
  deviceType,
  authorDevice,
}: GenerateUnlockKeyRegistrationArg): UnlockKeyRegistration {
  const ghostEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
  const ghostSignatureKeyPair = tcrypto.makeSignKeyPair();

  const encryptedUserKey = tcrypto.sealEncrypt(
    userKeys.privateKey,
    ghostEncryptionKeyPair.publicKey,
  );

  const ghostDevice: UserDeviceRecord = {
    ephemeral_public_signature_key: new Uint8Array(0),
    user_id: userId,
    delegation_signature: new Uint8Array(0),
    public_signature_key: ghostSignatureKeyPair.publicKey,
    public_encryption_key: ghostEncryptionKeyPair.publicKey,
    last_reset: new Uint8Array(tcrypto.HASH_SIZE),
    user_key_pair: {
      public_encryption_key: userKeys.publicKey,
      encrypted_private_encryption_key: encryptedUserKey,
    },
    is_ghost_device: true,
    is_server_device: (deviceType === DEVICE_TYPE.server_device),
    revoked: Number.MAX_SAFE_INTEGER,
  };

  const blockGenerator = new BlockGenerator(
    trustchainId,
    authorDevice.privateSignatureKey,
    authorDevice.id,
  );

  const newDeviceBlock = blockGenerator.addDevice(ghostDevice);

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

function createDeviceFromUnlockKeyV1({
  trustchainId,
  userId,
  deviceKeys,
  ghostDevice,
}: CreateDevUnlockArg): Block {
  const device: UserDeviceRecord = {
    ephemeral_public_signature_key: new Uint8Array(0),
    user_id: userId,
    delegation_signature: new Uint8Array(0),
    public_signature_key: deviceKeys.signaturePair.publicKey,
    public_encryption_key: deviceKeys.encryptionPair.publicKey,
    last_reset: new Uint8Array(tcrypto.HASH_SIZE),
    user_key_pair: null,
    is_ghost_device: false,
    // v1 cannot create servers
    is_server_device: false,
    revoked: Number.MAX_SAFE_INTEGER,
  };

  const blockGenerator = new BlockGenerator(
    trustchainId,
    ghostDevice.privateSignatureKey,
    ghostDevice.deviceId
  );

  return blockGenerator.addDeviceV1(device);
}

export function createDeviceFromUnlockKey(args: CreateDevUnlockArg): Block {
  if (args.encryptedUserKey)
    // $FlowIssue encryptedUserKey is *not* null
    return createDeviceFromUnlockKeyV3(args);
  else
    return createDeviceFromUnlockKeyV1(args);
}
