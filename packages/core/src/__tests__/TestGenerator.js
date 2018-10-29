// @flow

import { tcrypto, utils, random } from '@tanker/crypto';

import { blockToEntry } from '../Trustchain/TrustchainStore';
import type { UnverifiedEntry } from '../Blocks/entries';
import { getLastUserPublicKey, type User, type Device } from '../Users/UserStore';
import { type Group, type ExternalGroup } from '../Groups/types';

import type { UnverifiedDeviceCreation, UnverifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import type { UnverifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import type { UnverifiedUserGroup } from '../UnverifiedStore/UserGroupsUnverifiedStore';

import { hashBlock, signBlock, type Block } from '../Blocks/Block';
import { concatArrays, encodeArrayLength } from '../Blocks/Serialize';

import { rootEntryAuthor } from '../Trustchain/Verify';

import { NATURE_KIND, preferredNature } from '../Blocks/payloads';
import { BlockGenerator } from '../Blocks/BlockGenerator';
import { type DelegationToken } from '../Session/delegation';


export type TestDevice = {
  id: Uint8Array,
  signKeys: tcrypto.SodiumKeyPair,
  encryptionKeys: tcrypto.SodiumKeyPair,
  revokedAt: number;
}

export type TestUser = {
  id: Uint8Array,
  userKeys: tcrypto.SodiumKeyPair,
  devices: Array<TestDevice>,
}

export type TestTrustchainCreation = {
  unverifiedTrustchainCreation: UnverifiedEntry,
  block: Block,
  trustchainId: Uint8Array;
  trustchainKeys: tcrypto.SodiumKeyPair,
}

export type TestDeviceCreation = {
  unverifiedDeviceCreation: UnverifiedDeviceCreation,
  block: Block,
  testUser: TestUser,
  testDevice: TestDevice,
  user: User,
}

export type TestDeviceRevocation = {
  unverifiedDeviceRevocation: UnverifiedDeviceRevocation,
  block: Block,
  testUser: TestUser,
  user: User,
}

export type TestKeyPublish = {
  unverifiedKeyPublish: UnverifiedKeyPublish,
  block: Block,
};

export type TestUserGroup = {
  unverifiedUserGroup: UnverifiedUserGroup,
  block: Block,
  group: Group,
  externalGroup: ExternalGroup
};

function createDelegationToken(userId: Uint8Array, trustchainPrivateKey: Uint8Array): DelegationToken {
  const ephemeralKeys = tcrypto.makeSignKeyPair();

  const delegationBuffer = utils.concatArrays(ephemeralKeys.publicKey, userId);

  return {
    ephemeral_private_signature_key: ephemeralKeys.privateKey,
    ephemeral_public_signature_key: ephemeralKeys.publicKey,
    user_id: userId,
    delegation_signature: tcrypto.sign(delegationBuffer, trustchainPrivateKey),
    last_reset: new Uint8Array(32),
  };
}

class TestGenerator {
  _trustchainIndex: number = 0;
  _trustchainKeys: tcrypto.SodiumKeyPair;
  _trustchainId: Uint8Array;

  makeTrustchainCreation = (): TestTrustchainCreation => {
    this._trustchainKeys = tcrypto.makeSignKeyPair();
    this._trustchainIndex += 1;
    const rootBlock = {
      index: this._trustchainIndex,
      trustchain_id: new Uint8Array(0),
      nature: preferredNature(NATURE_KIND.trustchain_creation),
      author: rootEntryAuthor,
      payload: this._trustchainKeys.publicKey,
      signature: new Uint8Array(tcrypto.SIGNATURE_SIZE)
    };
    rootBlock.trustchain_id = hashBlock(rootBlock);
    this._trustchainId = rootBlock.trustchain_id;
    return {
      unverifiedTrustchainCreation: blockToEntry(rootBlock),
      block: rootBlock,
      trustchainId: rootBlock.trustchain_id,
      trustchainKeys: this._trustchainKeys
    };
  }

  makeUserCreation = (userId: Uint8Array): TestDeviceCreation => {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();

    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      signatureKeyPair.privateKey,
      new Uint8Array(0), // no deviceId available yet
    );

    this._trustchainIndex += 1;
    const newUserBlock = blockGenerator.makeNewUserBlock(
      userId,
      createDelegationToken(userId, this._trustchainKeys.privateKey),
      signatureKeyPair.publicKey,
      encryptionKeyPair.publicKey
    );
    newUserBlock.index = this._trustchainIndex;

    const entry = blockToEntry(newUserBlock);
    const unverifiedDeviceCreation: UnverifiedDeviceCreation = { ...entry, ...entry.payload_unverified };

    const userKeyPair = unverifiedDeviceCreation.user_key_pair;
    if (!userKeyPair) {
      throw new Error('flow check');
    }
    const privateUserKey = tcrypto.sealDecrypt(userKeyPair.encrypted_private_encryption_key, encryptionKeyPair);

    const testDevice: TestDevice = {
      id: unverifiedDeviceCreation.hash,
      signKeys: signatureKeyPair,
      encryptionKeys: encryptionKeyPair,
      revokedAt: Number.MAX_SAFE_INTEGER
    };

    const testUser = {
      id: userId,
      userKeys: {
        publicKey: userKeyPair.public_encryption_key,
        privateKey: privateUserKey
      },
      devices: [testDevice]
    };

    return {
      unverifiedDeviceCreation,
      block: newUserBlock,
      testUser,
      testDevice,
      user: this._testUserToUser(testUser)
    };
  }

  makeDeviceCreation = (parentDevice: TestDeviceCreation, isServer: bool = false): TestDeviceCreation => {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();

    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );

    this._trustchainIndex += 1;
    const block = blockGenerator.makeNewDeviceBlock(
      parentDevice.testUser.id,
      parentDevice.testUser.userKeys,
      signatureKeyPair.publicKey,
      encryptionKeyPair.publicKey,
      false,
      isServer,
    );
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    const unverifiedDeviceCreation: UnverifiedDeviceCreation = { ...entry, ...entry.payload_unverified };

    const testDevice: TestDevice = {
      id: unverifiedDeviceCreation.hash,
      signKeys: signatureKeyPair,
      encryptionKeys: encryptionKeyPair,
      revokedAt: Number.MAX_SAFE_INTEGER
    };
    const testUser = Object.assign({}, parentDevice.testUser);
    testUser.devices.push(testDevice);

    return {
      unverifiedDeviceCreation,
      block,
      testUser,
      testDevice,
      user: this._testUserToUser(testUser)
    };
  }

  makeDeviceRevocation = (parentDevice: TestDeviceCreation, deviceIdToRevoke: Uint8Array): TestDeviceRevocation => {
    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );

    this._trustchainIndex += 1;
    const block = blockGenerator.makeDeviceRevocationBlock(parentDevice.user, parentDevice.testUser.userKeys, utils.toBase64(deviceIdToRevoke));
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    const unverifiedDeviceRevocation: UnverifiedDeviceRevocation = { ...entry, ...entry.payload_unverified };

    const testUser = Object.assign({}, parentDevice.testUser);
    const device = testUser.devices.find((d) => utils.equalArray(d.id, deviceIdToRevoke));
    if (!device) {
      throw new Error('flow check');
    }
    device.revokedAt = this._trustchainIndex;

    return {
      unverifiedDeviceRevocation,
      block,
      testUser,
      user: this._testUserToUser(testUser)
    };
  }

  makeKeyPublishToDeviceBlock(parentDevice: TestDeviceCreation, recipient: Device): Block {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);
    const sharedKey = tcrypto.asymEncrypt(
      resourceKey,
      recipient.devicePublicEncryptionKey,
      parentDevice.testDevice.encryptionKeys.privateKey
    );
    const pKeyBlock = signBlock({
      index: 0,
      trustchain_id: this._trustchainId,
      nature: preferredNature(NATURE_KIND.key_publish_to_device),
      author: parentDevice.testDevice.id,
      payload: concatArrays(
        recipient.devicePublicEncryptionKey,
        resourceId,
        encodeArrayLength(sharedKey), sharedKey
      ) }, parentDevice.testDevice.signKeys.privateKey);
    return pKeyBlock;
  }

  makeKeyPublishToDevice = (parentDevice: TestDeviceCreation, recipient: Device): TestKeyPublish => {
    this._trustchainIndex += 1;
    const block = this.makeKeyPublishToDeviceBlock(parentDevice, recipient);
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    const unverifiedKeyPublish: UnverifiedKeyPublish = { ...entry, ...entry.payload_unverified };
    return {
      unverifiedKeyPublish,
      block,
    };
  }

  makeKeyPublishToUser = (parentDevice: TestDeviceCreation, recipient: User): TestKeyPublish => {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;
    const lastUserKey = getLastUserPublicKey(recipient);
    if (!lastUserKey) {
      throw new Error('flow check');
    }
    const block = blockGenerator.makeKeyPublishBlock(lastUserKey, resourceKey, resourceId, NATURE_KIND.key_publish_to_user);
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    const unverifiedKeyPublish: UnverifiedKeyPublish = { ...entry, ...entry.payload_unverified };

    return {
      unverifiedKeyPublish,
      block,
    };
  }

  makeKeyPublishToGroup = (parentDevice: TestDeviceCreation, recipient: ExternalGroup): TestKeyPublish => {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;
    const block = blockGenerator.makeKeyPublishBlock(recipient.publicEncryptionKey, resourceKey, resourceId, NATURE_KIND.key_publish_to_user_group);
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    const unverifiedKeyPublish: UnverifiedKeyPublish = { ...entry, ...entry.payload_unverified };

    return {
      unverifiedKeyPublish,
      block,
    };
  }


  makeUserGroupCreation = (parentDevice: TestDeviceCreation, members: Array<User>): TestUserGroup => {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;
    const block = blockGenerator.createUserGroup(signatureKeyPair, encryptionKeyPair, members);
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    // $FlowIKnow: this works
    const unverifiedUserGroup: UnverifiedUserGroup = { ...entry, ...entry.payload_unverified };

    const group = {
      groupId: signatureKeyPair.publicKey,
      signatureKeyPair,
      encryptionKeyPair,
      lastGroupBlock: entry.hash,
      index: entry.index,
    };
    const externalGroup = {
      groupId: signatureKeyPair.publicKey,
      publicSignatureKey: signatureKeyPair.publicKey,
      publicEncryptionKey: encryptionKeyPair.publicKey,
      lastGroupBlock: entry.hash,
      encryptedPrivateSignatureKey: null,
      index: entry.index,
    };
    return {
      unverifiedUserGroup,
      block,
      group,
      externalGroup
    };
  }

  makeUserGroupAddition = (parentDevice: TestDeviceCreation, previousGroup: TestUserGroup, newMembers: Array<User>): TestUserGroup => {
    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;
    const block = blockGenerator.addToUserGroup(
      previousGroup.group.groupId,
      previousGroup.group.signatureKeyPair.privateKey,
      previousGroup.group.lastGroupBlock,
      previousGroup.group.encryptionKeyPair.privateKey,
      newMembers
    );
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    // $FlowIKnow: this works
    const unverifiedUserGroup: UnverifiedUserGroup = { ...entry, ...entry.payload_unverified };

    const group: Group = (Object.assign({}, previousGroup.group): any);
    group.lastGroupBlock = entry.hash;
    group.index = entry.index;

    const externalGroup: ExternalGroup = (Object.assign({}, previousGroup.externalGroup): any);
    externalGroup.lastGroupBlock = entry.hash;
    externalGroup.index = entry.index;

    return {
      unverifiedUserGroup,
      block,
      group,
      externalGroup
    };
  }


  _testDeviceToDevice = (testDevice: TestDevice): Device => ({
    deviceId: utils.toBase64(testDevice.id),
    devicePublicEncryptionKey: testDevice.encryptionKeys.publicKey,
    devicePublicSignatureKey: testDevice.signKeys.publicKey,
    isGhostDevice: false,
    isServerDevice: false,
    createdAt: 0,
    revokedAt: testDevice.revokedAt,
  })

  _testUserToUser(user: TestUser): User {
    return {
      userId: utils.toBase64(user.id),
      userPublicKeys: user.userKeys ? [{ index: 1, userPublicKey: user.userKeys.publicKey }] : [],
      devices: user.devices.map(this._testDeviceToDevice),
    };
  }
}
export default TestGenerator;

