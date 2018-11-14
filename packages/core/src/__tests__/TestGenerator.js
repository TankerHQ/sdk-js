// @flow
import find from 'array-find';
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

import { NATURE, NATURE_KIND, preferredNature } from '../Blocks/payloads';
import { BlockGenerator } from '../Blocks/BlockGenerator';
import { type DelegationToken } from '../Session/delegation';


export type TestDevice = {
  id: Uint8Array,
  signKeys: tcrypto.SodiumKeyPair,
  encryptionKeys: tcrypto.SodiumKeyPair,
  createdAt: number;
  revokedAt: number;
}

type TestUserKeys = {
  index: number,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
}

export type TestUser = {
  id: Uint8Array,
  userKeys: Array<TestUserKeys>,
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
  unverifiedDeviceCreationV1: UnverifiedDeviceCreation,
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

  skipIndex = () => {
    this._trustchainIndex += 1;
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
    const newUserBlock = blockGenerator.makeNewUserBlock({
      userId,
      delegationToken: createDelegationToken(userId, this._trustchainKeys.privateKey),
      publicSignatureKey: signatureKeyPair.publicKey,
      publicEncryptionKey: encryptionKeyPair.publicKey
    });
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
      createdAt: entry.index,
      revokedAt: Number.MAX_SAFE_INTEGER
    };

    const testUser = {
      id: userId,
      userKeys: [{
        publicKey: userKeyPair.public_encryption_key,
        privateKey: privateUserKey,
        index: entry.index
      }],
      devices: [testDevice]
    };

    return {
      unverifiedDeviceCreation,
      unverifiedDeviceCreationV1: this._deviceCreationV1(unverifiedDeviceCreation),
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
    const block = blockGenerator.makeNewDeviceBlock({
      userId: parentDevice.testUser.id,
      userKeys: parentDevice.testUser.userKeys[parentDevice.testUser.userKeys.length - 1],
      publicSignatureKey: signatureKeyPair.publicKey,
      publicEncryptionKey: encryptionKeyPair.publicKey,
      isGhost: false,
      isServer,
    });
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    const unverifiedDeviceCreation: UnverifiedDeviceCreation = { ...entry, ...entry.payload_unverified };

    const testDevice: TestDevice = {
      id: unverifiedDeviceCreation.hash,
      signKeys: signatureKeyPair,
      encryptionKeys: encryptionKeyPair,
      createdAt: entry.index,
      revokedAt: Number.MAX_SAFE_INTEGER
    };
    const testUser = Object.assign({}, parentDevice.testUser);
    testUser.devices.push(testDevice);

    return {
      unverifiedDeviceCreation,
      unverifiedDeviceCreationV1: this._deviceCreationV1(unverifiedDeviceCreation),
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
    const block = blockGenerator.makeDeviceRevocationBlock(parentDevice.user, parentDevice.testUser.userKeys[parentDevice.testUser.userKeys.length - 1], utils.toBase64(deviceIdToRevoke));
    block.index = this._trustchainIndex;

    const entry = blockToEntry(block);
    const unverifiedDeviceRevocation: UnverifiedDeviceRevocation = { ...entry, ...entry.payload_unverified, user_id: parentDevice.testUser.id };

    const testUser = { ...parentDevice.testUser,
      devices: parentDevice.testUser.devices.map(d => {
        if (utils.equalArray(d.id, deviceIdToRevoke)) {
          return { ...d, revokedAt: entry.index };
        }
        return { ...d };
      }),
      userKeys: [...parentDevice.testUser.userKeys]
    };

    // $FlowIKnow unverifiedDeviceRevocation.user_keys is not null
    const keyForParentDevice = find(unverifiedDeviceRevocation.user_keys.private_keys, key => utils.equalArray(key.recipient, parentDevice.testDevice.encryptionKeys.publicKey));

    if (keyForParentDevice) {
      testUser.userKeys.push({
        // $FlowIKnow unverifiedDeviceRevocation.user_keys is not null
        publicKey: unverifiedDeviceRevocation.user_keys.public_encryption_key,
        privateKey: tcrypto.sealDecrypt(keyForParentDevice.key, parentDevice.testDevice.encryptionKeys),
        index: entry.index
      });
    } else {
      testUser.userKeys.push({
        // $FlowIKnow unverifiedDeviceRevocation.user_keys is not null
        publicKey: unverifiedDeviceRevocation.user_keys.public_encryption_key,
        privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
        index: entry.index
      });
    }

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
    createdAt: testDevice.createdAt,
    revokedAt: testDevice.revokedAt,
  })

  _testUserToUser(user: TestUser): User {
    return {
      userId: utils.toBase64(user.id),
      userPublicKeys: user.userKeys ? user.userKeys.map(key => ({ index: key.index, userPublicKey: key.publicKey })) : [],
      devices: user.devices.map(this._testDeviceToDevice),
    };
  }

  _deviceCreationV1(deviceCreation: UnverifiedDeviceCreation): UnverifiedDeviceCreation {
    const deviceCreationV1 = Object.assign({}, deviceCreation);
    deviceCreationV1.nature = NATURE.device_creation_v1;
    deviceCreationV1.user_key_pair = null;
    return deviceCreationV1;
  }
}
export default TestGenerator;
