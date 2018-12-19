// @flow
import { tcrypto, random, utils } from '@tanker/crypto';
import { obfuscateUserId } from '@tanker/identity';

import { type UnverifiedEntry, blockToEntry } from '../Blocks/entries';
import BlockGenerator from '../Blocks/BlockGenerator';
import type { Device, User } from '../Users/User';
import { type UnverifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import type { UnverifiedDeviceCreation, UnverifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { concatArrays, encodeArrayLength } from '../Blocks/Serialize';

import { signBlock, hashBlock, type Block } from '../Blocks/Block';
import { serializeTrustchainCreation,
  serializeUserDeviceV3,
  serializeKeyPublish,
  serializeDeviceRevocationV1,
  serializeDeviceRevocationV2,
  type UserDeviceRecord,
  type KeyPublishRecord } from '../Blocks/payloads';

import { preferredNature, NATURE, NATURE_KIND, type Nature } from '../Blocks/Nature';


export type GeneratorDevice = {
  id: Uint8Array,
  signKeys: tcrypto.SodiumKeyPair,
  encryptionKeys: tcrypto.SodiumKeyPair,
}

export type GeneratorUser = {
  id: string,
  userKeys?: tcrypto.SodiumKeyPair,
  devices: Array<GeneratorDevice>,
}

export function serializeUserDeviceV1(userDevice: UserDeviceRecord): Uint8Array {
  return concatArrays(
    userDevice.ephemeral_public_signature_key,
    userDevice.user_id,
    userDevice.delegation_signature,
    userDevice.public_signature_key,
    userDevice.public_encryption_key,
  );
}

export function serializeKeyPublishToDevice(keyPublish: KeyPublishRecord): Uint8Array {
  return concatArrays(
    keyPublish.recipient,
    keyPublish.resourceId,
    encodeArrayLength(keyPublish.key), keyPublish.key
  );
}

export function generatorDeviceToDevice(u: GeneratorDevice): Device {
  return {
    deviceId: utils.toBase64(u.id),
    devicePublicEncryptionKey: u.encryptionKeys.publicKey,
    devicePublicSignatureKey: u.signKeys.publicKey,
    isGhostDevice: false,
    createdAt: 0,
    revokedAt: Number.MAX_SAFE_INTEGER,
  };
}

export function generatorUserToUser(trustchainId: Uint8Array, u: GeneratorUser): User {
  return {
    userId: utils.toBase64(obfuscateUserId(trustchainId, u.id)),
    userPublicKeys: u.userKeys ? [{ index: 1, userPublicKey: u.userKeys.publicKey }] : [],
    devices: u.devices.map(generatorDeviceToDevice),
  };
}

export type GeneratorUserResult = {
  entry: UnverifiedEntry,
  block: Block,
  user: GeneratorUser,
  device: GeneratorDevice,
  blockPrivateSignatureKey: Uint8Array,
  unverifiedDeviceCreation: UnverifiedDeviceCreation,
}

export type GeneratorRevocationResult = {
  entry: UnverifiedEntry,
  block: Block,
  user: GeneratorUser,
  blockPrivateSignatureKey: Uint8Array,
  unverifiedDeviceRevocation: UnverifiedDeviceRevocation,
}

export type GeneratorKeyResult = {
  entry: UnverifiedEntry,
  block: Block,
  symmetricKey: Uint8Array,
  resourceId: Uint8Array,
  blockPrivateSignatureKey: Uint8Array,
  unverifiedKeyPublish: UnverifiedKeyPublish,
}

export type GeneratorUserGroupResult = {
  entry: UnverifiedEntry,
  block: Block,
  groupSignatureKeyPair: tcrypto.SodiumKeyPair,
  groupEncryptionKeyPair: tcrypto.SodiumKeyPair,
  blockPrivateSignatureKey: Uint8Array,
}

export type GeneratorUserGroupAdditionResult = {
  entry: UnverifiedEntry,
  block: Block,
  blockPrivateSignatureKey: Uint8Array,
}

type CreateUserResult = {
  block: Block,
  entry: UnverifiedEntry,
  device: GeneratorDevice,
  blockPrivateSignatureKey: Uint8Array,
  unverifiedDeviceCreation: UnverifiedDeviceCreation,
}

const rootBlockAuthor = new Uint8Array(32);

class Generator {
  trustchainId: Uint8Array;
  trustchainIndex: number = 1;
  appSignKeys: Object;
  pushedBlocks: Array<Block>;
  root: { block: Block, entry: UnverifiedEntry };
  users: { [userId: string]: GeneratorUser } = {};
  usersDevices: { [deviceId: string]: string } = {};

  constructor(trustchainId: Uint8Array, rootBlock: Block, appSignKeys: Object) {
    this.trustchainId = trustchainId;
    this.appSignKeys = appSignKeys;
    this.pushedBlocks = [rootBlock];
    this.root = {
      block: rootBlock,
      entry: blockToEntry(rootBlock),
    };
  }

  static async open(appSignKeys: Object): Promise<Generator> {
    // force a copy here or some tests will break
    const payload = { public_signature_key: new Uint8Array(appSignKeys.publicKey) };
    const rootBlock = {
      index: 1,
      trustchain_id: new Uint8Array(0),
      nature: preferredNature(NATURE_KIND.trustchain_creation),
      author: rootBlockAuthor,
      payload: serializeTrustchainCreation(payload),
      signature: new Uint8Array(tcrypto.SIGNATURE_SIZE) };
    rootBlock.trustchain_id = blockToEntry(rootBlock).hash;
    return new Generator(rootBlock.trustchain_id, rootBlock, appSignKeys);
  }

  createUser(args: { userId: string, parentDevice?: GeneratorDevice, userKeys: tcrypto.SodiumKeyPair, nature: Nature}): CreateUserResult {
    const ephemeralKeys = tcrypto.makeSignKeyPair();
    const signKeys = tcrypto.makeSignKeyPair();
    const encryptionKeys = tcrypto.makeEncryptionKeyPair();

    const obfuscatedUserId = obfuscateUserId(this.trustchainId, args.userId);
    const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, obfuscatedUserId);

    let authorPrivateKey = this.appSignKeys.privateKey;
    let author = this.root.entry.hash;
    if (args.parentDevice) {
      // A parent device exists so we are in the add Device case
      authorPrivateKey = args.parentDevice.signKeys.privateKey;
      author = args.parentDevice.id;
    }
    let userKeyPair = null;
    if (args.nature === NATURE.device_creation_v3) {
      userKeyPair = {
        public_encryption_key: args.userKeys.publicKey,
        encrypted_private_encryption_key: new Uint8Array(tcrypto.SEALED_KEY_SIZE),
      };
    }
    const payload: UserDeviceRecord = {
      last_reset: new Uint8Array(tcrypto.HASH_SIZE),
      ephemeral_public_signature_key: ephemeralKeys.publicKey,
      user_id: obfuscatedUserId,
      delegation_signature: tcrypto.sign(delegationBuffer, authorPrivateKey),
      public_signature_key: signKeys.publicKey,
      public_encryption_key: encryptionKeys.publicKey,
      is_ghost_device: false,
      revoked: Number.MAX_SAFE_INTEGER,
      user_key_pair: userKeyPair,
    };
    this.trustchainIndex += 1;

    let serializedPayload = null;
    if (args.nature === NATURE.device_creation_v3) {
      serializedPayload = serializeUserDeviceV3(payload);
    } else {
      serializedPayload = serializeUserDeviceV1(payload);
    }

    const block = signBlock({
      index: this.trustchainIndex,
      trustchain_id: this.trustchainId,
      nature: args.nature,
      author,
      payload: serializedPayload,
    }, ephemeralKeys.privateKey);

    const entry = blockToEntry(block);
    const device = { id: entry.hash, signKeys, encryptionKeys };
    const unverifiedDeviceCreation = { ...entry, ...entry.payload_unverified };
    return { block, entry, device, blockPrivateSignatureKey: ephemeralKeys.privateKey, unverifiedDeviceCreation };
  }

  async newUserCreationV1(userId: string, { unsafe }: { unsafe: bool } = {}): Promise<GeneratorUserResult> {
    if (!unsafe && this.users[userId])
      throw new Error(`Generator: user ${userId} already exists`);
    const result = this.createUser({ userId, userKeys: tcrypto.makeEncryptionKeyPair(), nature: NATURE.device_creation_v1 });

    const user = { id: userId, devices: [result.device] };
    this.users[userId] = user;
    this.usersDevices[utils.toBase64(result.entry.hash)] = userId;

    this.pushedBlocks.push(result.block);
    return {
      ...result,
      user,
    };
  }

  async newUserCreationV3(userId: string, { unsafe }: { unsafe?: bool } = {}): Promise<GeneratorUserResult> {
    if (!unsafe && this.users[userId])
      throw new Error(`Generator: user ${userId} already exists`);
    const userKeys = tcrypto.makeEncryptionKeyPair();

    const result = this.createUser({ userId, userKeys, nature: NATURE.device_creation_v3 });

    const user = { id: userId, userKeys, devices: [result.device] };
    this.users[userId] = user;
    this.usersDevices[utils.toBase64(result.entry.hash)] = userId;

    this.pushedBlocks.push(result.block);
    return {
      ...result,
      user,
    };
  }

  async newDeviceCreationV1(args: { userId: string, parentIndex: number }): Promise<GeneratorUserResult> {
    const { userId, parentIndex } = args;
    if (!this.users[userId])
      throw new Error(`Generator: cannot add device: ${userId} does not exist`);
    const user = this.users[userId];
    const { devices } = user;
    if (parentIndex > devices.length)
      throw new Error('Generator: cannot add device: index out of bounds');
    const parentDevice = devices[parentIndex];

    const result = this.createUser({ userId, userKeys: tcrypto.makeEncryptionKeyPair(), parentDevice, nature: NATURE.device_creation_v1 });

    this.users[userId] = { ...user, devices: [...user.devices, result.device] };
    this.usersDevices[utils.toBase64(result.entry.hash)] = userId;

    this.pushedBlocks.push(result.block);
    return {
      ...result,
      user: { ...this.users[userId] },
    };
  }

  async newDeviceCreationV3(args: { userId: string, parentIndex: number }): Promise<GeneratorUserResult> {
    const { userId, parentIndex } = args;
    if (!this.users[userId])
      throw new Error(`Generator: cannot add device: ${userId} does not exist`);
    const user = this.users[userId];
    const { userKeys, devices } = user;
    if (!userKeys)
      throw new Error('Generator: cannot add a deviceCreationV3 on a user V1');
    if (parentIndex > devices.length)
      throw new Error('Generator: cannot add device: index out of bounds');
    const parentDevice = devices[parentIndex];

    const result = this.createUser({ userId, userKeys, parentDevice, nature: NATURE.device_creation_v3 });

    this.users[userId] = { ...user, devices: [...user.devices, result.device] };
    this.usersDevices[utils.toBase64(result.entry.hash)] = userId;

    this.pushedBlocks.push(result.block);
    return {
      ...result,
      user: { ...this.users[userId] },
    };
  }

  async newKeyPublishToDevice(args: { symmetricKey?: Uint8Array, resourceId?: Uint8Array, toDevice: GeneratorDevice, fromDevice: GeneratorDevice }): Promise<GeneratorKeyResult> {
    let { resourceId, symmetricKey } = args;
    if (!resourceId)
      resourceId = random(tcrypto.MAC_SIZE);
    if (!symmetricKey)
      symmetricKey = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encryptedKey = tcrypto.asymEncrypt(
      symmetricKey,
      args.toDevice.encryptionKeys.publicKey,
      args.fromDevice.encryptionKeys.privateKey
    );
    const share = {
      resourceId,
      recipient: args.toDevice.id,
      key: encryptedKey,
    };
    this.trustchainIndex += 1;
    const block = signBlock({
      index: this.trustchainIndex,
      trustchain_id: this.trustchainId,
      nature: NATURE.key_publish_to_device,
      author: args.fromDevice.id,
      payload: serializeKeyPublishToDevice(share)
    }, args.fromDevice.signKeys.privateKey);
    this.pushedBlocks.push(block);
    const entry = blockToEntry(block);
    const unverifiedKeyPublish = {
      ...entry,
      ...entry.payload_unverified,
    };
    return {
      symmetricKey,
      resourceId,
      block,
      entry,
      unverifiedKeyPublish,
      blockPrivateSignatureKey: args.fromDevice.signKeys.privateKey,
    };
  }

  async newCommonKeyPublish(args: { symmetricKey?: Uint8Array, resourceId?: Uint8Array, fromDevice: GeneratorDevice, toKey: Uint8Array, nature: Nature }) {
    let { resourceId, symmetricKey } = args;
    if (!resourceId)
      resourceId = random(tcrypto.MAC_SIZE);
    if (!symmetricKey)
      symmetricKey = random(tcrypto.SYMMETRIC_KEY_SIZE);

    const encryptedKey = tcrypto.sealEncrypt(
      symmetricKey,
      args.toKey,
    );
    const share = {
      resourceId,
      recipient: args.toKey,
      key: encryptedKey,
    };
    this.trustchainIndex += 1;
    const block = signBlock({
      index: this.trustchainIndex,
      trustchain_id: this.trustchainId,
      nature: args.nature,
      author: args.fromDevice.id,
      payload: serializeKeyPublish(share)
    }, args.fromDevice.signKeys.privateKey);
    this.pushedBlocks.push(block);
    const entry = blockToEntry(block);
    const unverifiedKeyPublish = {
      ...entry,
      ...entry.payload_unverified,
    };
    return {
      symmetricKey,
      resourceId,
      block,
      entry,
      unverifiedKeyPublish,
      blockPrivateSignatureKey: args.fromDevice.signKeys.privateKey,
    };
  }

  async newKeyPublishToUser(args: { symmetricKey?: Uint8Array, resourceId?: Uint8Array, toUser: GeneratorUser, fromDevice: GeneratorDevice }): Promise<GeneratorKeyResult> {
    if (!args.toUser.userKeys)
      throw new Error('Generator: cannot add a keyPublish to user on a user V1');

    return this.newCommonKeyPublish({
      ...args,
      toKey: args.toUser.userKeys.publicKey,
      nature: NATURE.key_publish_to_user,
    });
  }

  async newKeyPublishToUserGroup(args: { symmetricKey?: Uint8Array, resourceId?: Uint8Array, toGroup: GeneratorUserGroupResult, fromDevice: GeneratorDevice }): Promise<GeneratorKeyResult> {
    return this.newCommonKeyPublish({
      ...args,
      toKey: args.toGroup.groupEncryptionKeyPair.publicKey,
      nature: NATURE.key_publish_to_user_group,
    });
  }

  async newKeyPublishToPreUser(args: { symmetricKey?: Uint8Array, resourceId?: Uint8Array, toPresharePublicKey: Uint8Array, fromDevice: GeneratorDevice }): Promise<GeneratorKeyResult> {
    return this.newCommonKeyPublish({
      ...args,
      toKey: args.toPresharePublicKey,
      nature: NATURE.key_publish_to_pre_user,
    });
  }

  async newDeviceRevocationV1(from: GeneratorDevice, to: { id: Uint8Array }, { unsafe }: { unsafe: bool } = {}): Promise<GeneratorRevocationResult> {
    const deviceId = utils.toBase64(to.id);
    const userId = this.usersDevices[deviceId];
    const { userKeys } = this.users[userId];
    if (!unsafe && userKeys)
      throw new Error('Generator: cannot add a deviceRevocationV1 on a device V2');

    const payload = {
      device_id: to.id,
    };
    this.trustchainIndex += 1;
    const block = signBlock({
      index: this.trustchainIndex,
      trustchain_id: this.trustchainId,
      nature: NATURE.device_revocation_v1,
      author: from.id,
      payload: serializeDeviceRevocationV1(payload)
    }, from.signKeys.privateKey);
    this.pushedBlocks.push(block);
    this.users[userId].devices = this.users[userId].devices.filter(d => !utils.equalArray(d.id, to.id));

    const hashedUserId = obfuscateUserId(this.trustchainId, userId);
    const entry: UnverifiedEntry = { ...blockToEntry(block), user_id: hashedUserId };
    const unverifiedDeviceRevocation = { ...entry, ...entry.payload_unverified };
    return {
      block,
      entry,
      user: { ...this.users[userId] },
      blockPrivateSignatureKey: from.signKeys.privateKey,
      unverifiedDeviceRevocation,
    };
  }

  async newDeviceRevocationV2(from: GeneratorDevice, to: { id: Uint8Array }): Promise<GeneratorRevocationResult> {
    const deviceId = utils.toBase64(to.id);
    const userId = this.usersDevices[deviceId];

    const newUserKey = tcrypto.makeEncryptionKeyPair();
    let { userKeys } = this.users[userId];
    if (!userKeys)
      userKeys = {
        publicKey: new Uint8Array(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
        privateKey: new Uint8Array(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
      };

    const remainingDevices = this.users[userId].devices.filter(d => !utils.equalArray(d.id, to.id));
    const encryptedPrivateKeys = remainingDevices.map(d => ({
      recipient: d.id,
      key: tcrypto.sealEncrypt(newUserKey.privateKey, d.encryptionKeys.publicKey),
    }));

    let encryptedPreviousEncryptionKey = tcrypto.sealEncrypt(userKeys.privateKey, newUserKey.publicKey);
    if (!this.users[userId].userKeys)
      encryptedPreviousEncryptionKey = new Uint8Array(tcrypto.SEALED_KEY_SIZE);
    const payload = {
      device_id: to.id,
      user_keys: {
        public_encryption_key: newUserKey.publicKey,
        previous_public_encryption_key: userKeys.publicKey,
        encrypted_previous_encryption_key: encryptedPreviousEncryptionKey,
        private_keys: encryptedPrivateKeys,
      },
    };
    this.users[userId].userKeys = newUserKey;
    this.trustchainIndex += 1;
    const block = signBlock({
      index: this.trustchainIndex,
      trustchain_id: this.trustchainId,
      nature: NATURE.device_revocation_v2,
      author: from.id,
      payload: serializeDeviceRevocationV2(payload)
    }, from.signKeys.privateKey);
    this.pushedBlocks.push(block);
    this.users[userId].devices = this.users[userId].devices.filter(d => !utils.equalArray(d.id, to.id));

    const hashedUserId = obfuscateUserId(this.trustchainId, userId);
    const entry: UnverifiedEntry = { ...blockToEntry(block), user_id: hashedUserId };
    const unverifiedDeviceRevocation = { ...entry, ...entry.payload_unverified };
    return {
      block,
      entry,
      user: { ...this.users[userId] },
      blockPrivateSignatureKey: from.signKeys.privateKey,
      unverifiedDeviceRevocation,
    };
  }

  async newUserGroupCreation(from: GeneratorDevice, members: Array<string>): Promise<GeneratorUserGroupResult> {
    const blockGenerator = new BlockGenerator(
      this.trustchainId,
      from.signKeys.privateKey,
      from.id
    );

    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();
    const groupEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();

    const fullUsers = members.map(m => generatorUserToUser(this.trustchainId, this.users[m]));

    const block = blockGenerator.createUserGroup(groupSignatureKeyPair, groupEncryptionKeyPair, fullUsers);

    this.trustchainIndex += 1;
    block.index = this.trustchainIndex;
    this.pushedBlocks.push(block);

    const entry: UnverifiedEntry = blockToEntry(block);
    return {
      block,
      entry,
      groupSignatureKeyPair,
      groupEncryptionKeyPair,
      blockPrivateSignatureKey: from.signKeys.privateKey,
    };
  }

  async newUserGroupAddition(from: GeneratorDevice, group: GeneratorUserGroupResult, members: Array<string>): Promise<GeneratorUserGroupAdditionResult> {
    const blockGenerator = new BlockGenerator(
      this.trustchainId,
      from.signKeys.privateKey,
      from.id
    );

    const fullUsers = members.map(m => generatorUserToUser(this.trustchainId, this.users[m]));
    const block = blockGenerator.addToUserGroup(group.groupSignatureKeyPair.publicKey, group.groupSignatureKeyPair.privateKey, hashBlock(group.block), group.groupEncryptionKeyPair.privateKey, fullUsers);

    this.trustchainIndex += 1;
    block.index = this.trustchainIndex;
    this.pushedBlocks.push(block);

    const entry: UnverifiedEntry = blockToEntry(block);
    return {
      block,
      entry,
      blockPrivateSignatureKey: group.blockPrivateSignatureKey,
    };
  }


  userId(userName: string): Uint8Array {
    return obfuscateUserId(this.trustchainId, userName);
  }
}

export async function makeGenerator() {
  const trustchainKeyPair = tcrypto.makeSignKeyPair();
  const generator = await Generator.open(trustchainKeyPair);

  return {
    trustchainKeyPair,
    generator,
  };
}

export default Generator;
