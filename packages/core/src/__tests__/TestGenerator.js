// @flow
import find from 'array-find';
import { tcrypto, utils, random, type b64string } from '@tanker/crypto';
import { type PublicProvisionalUser, createIdentity, getPublicIdentity } from '@tanker/identity';

import {
  provisionalIdentityClaimFromBlock,
  type ClaimEntry,
} from '../Session/ProvisionalIdentity/Serialize';

import { type TrustchainCreationEntry, trustchainCreationFromBlock } from '../Session/LocalUser/Serialize';

import {
  userEntryFromBlock,
  type DeviceCreationEntry,
  type DeviceRevocationEntry,
} from '../Users/Serialize';

import {
  type UserGroupEntry,
  getGroupEntryFromBlock,
} from '../Groups/Serialize';

import { hashBlock } from '../Blocks/Block';
import { serializeBlock, unserializeBlock } from '../Blocks/payloads';

import { getLastUserPublicKey, type User, type Device } from '../Users/types';
import { type Group } from '../Groups/types';
import { type KeyPublishEntry, getKeyPublishEntryFromBlock } from '../DataProtection/Resource/keyPublish';

import { rootBlockAuthor } from '../Session/LocalUser/Verify';

import { NATURE, NATURE_KIND, preferredNature } from '../Blocks/Nature';
import { BlockGenerator } from '../Blocks/BlockGenerator';
import { type DelegationToken } from '../Session/UserData';


export type TestDevice = {
  id: Uint8Array,
  signKeys: tcrypto.SodiumKeyPair,
  encryptionKeys: tcrypto.SodiumKeyPair,
  createdAt: number;
  revokedAt: number;
}

export type TestProvisionalUser = {
    trustchainId: Uint8Array,
    target: string,
    value: string,
    appSignaturePublicKey: Uint8Array,
    appEncryptionPublicKey: Uint8Array,
    tankerSignaturePublicKey: Uint8Array,
    tankerEncryptionPublicKey: Uint8Array,
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
  identity: string,
  publicIdentity: string,
}

export type TestTrustchainCreation = {
  unverifiedTrustchainCreation: TrustchainCreationEntry,
  block: b64string,
  trustchainId: Uint8Array;
  trustchainKeys: tcrypto.SodiumKeyPair,
}

export type TestDeviceCreation = {
  unverifiedDeviceCreation: DeviceCreationEntry,
  unverifiedDeviceCreationV1: DeviceCreationEntry,
  block: b64string,
  testUser: TestUser,
  testDevice: TestDevice,
  user: User,
}

export type TestDeviceRevocation = {
  unverifiedDeviceRevocation: DeviceRevocationEntry,
  block: b64string,
  testUser: TestUser,
  user: User,
}

export type TestKeyPublish = {
  block: b64string,
  keyPublish: KeyPublishEntry,
  resourceId: Uint8Array,
  resourceKey: Uint8Array
};

export type TestUserGroup = {
  userGroupEntry: UserGroupEntry,
  block: b64string,
  group: Group
};

export type TestIdentityClaim = {
  unverifiedProvisionalIdentityClaim: ClaimEntry,
  block: b64string,
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
      author: rootBlockAuthor,
      payload: this._trustchainKeys.publicKey,
      signature: new Uint8Array(tcrypto.SIGNATURE_SIZE)
    };

    rootBlock.trustchain_id = hashBlock(rootBlock);
    const block = utils.toBase64(serializeBlock(rootBlock));
    const unverifiedTrustchainCreation: TrustchainCreationEntry = trustchainCreationFromBlock(block);

    this._trustchainId = rootBlock.trustchain_id;
    return {
      unverifiedTrustchainCreation,
      block,
      trustchainId: rootBlock.trustchain_id,
      trustchainKeys: this._trustchainKeys
    };
  }

  skipIndex = () => {
    this._trustchainIndex += 1;
  }

  makeProvisionalUser = () => {
    const appSignatureKeyPair = tcrypto.makeSignKeyPair();
    const appEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const tankerSignatureKeyPair = tcrypto.makeSignKeyPair();
    const tankerEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    return {
      publicProvisionalUser: {
        trustchainId: this._trustchainId,
        target: 'email',
        value: 'email@example.com',
        appSignaturePublicKey: appSignatureKeyPair.publicKey,
        appEncryptionPublicKey: appEncryptionKeyPair.publicKey,
        tankerSignaturePublicKey: tankerSignatureKeyPair.publicKey,
        tankerEncryptionPublicKey: tankerEncryptionKeyPair.publicKey,
      },
      provisionalUserKeys: {
        appSignatureKeyPair,
        appEncryptionKeyPair,
        tankerSignatureKeyPair,
        tankerEncryptionKeyPair,
      }
    };
  };

  makeUserCreation = async (userId: Uint8Array): Promise<TestDeviceCreation> => {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();

    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      signatureKeyPair.privateKey,
      new Uint8Array(0), // no deviceId available yet
    );

    this._trustchainIndex += 1;
    let newUserBlock = blockGenerator.makeNewUserBlock({
      userId,
      delegationToken: createDelegationToken(userId, this._trustchainKeys.privateKey),
      publicSignatureKey: signatureKeyPair.publicKey,
      publicEncryptionKey: encryptionKeyPair.publicKey
    });
    newUserBlock = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(newUserBlock)), index: this._trustchainIndex }));

    const unverifiedDeviceCreation = ((userEntryFromBlock(newUserBlock): any): DeviceCreationEntry);

    const userKeyPair = unverifiedDeviceCreation.user_key_pair;
    if (!userKeyPair) {
      throw new Error('flow check');
    }
    const privateUserKey = tcrypto.sealDecrypt(userKeyPair.encrypted_private_encryption_key, encryptionKeyPair);

    const testDevice: TestDevice = {
      id: unverifiedDeviceCreation.hash,
      signKeys: signatureKeyPair,
      encryptionKeys: encryptionKeyPair,
      createdAt: unverifiedDeviceCreation.index,
      revokedAt: Number.MAX_SAFE_INTEGER
    };

    const identity = await createIdentity(utils.toBase64(this._trustchainId), utils.toBase64(this._trustchainKeys.privateKey), utils.toBase64(userId));
    const publicIdentity = await getPublicIdentity(identity);

    const testUser = {
      id: userId,
      userKeys: [{
        publicKey: userKeyPair.public_encryption_key,
        privateKey: privateUserKey,
        index: unverifiedDeviceCreation.index
      }],
      devices: [testDevice],
      identity,
      publicIdentity,
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

  makeDeviceCreation = (parentDevice: TestDeviceCreation): TestDeviceCreation => {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();

    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );

    this._trustchainIndex += 1;
    let block = blockGenerator.makeNewDeviceBlock({
      userId: parentDevice.testUser.id,
      userKeys: parentDevice.testUser.userKeys[parentDevice.testUser.userKeys.length - 1],
      publicSignatureKey: signatureKeyPair.publicKey,
      publicEncryptionKey: encryptionKeyPair.publicKey,
      isGhost: false,
    });
    block = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(block)), index: this._trustchainIndex }));

    const unverifiedDeviceCreation = ((userEntryFromBlock(block): any): DeviceCreationEntry);

    const testDevice: TestDevice = {
      id: unverifiedDeviceCreation.hash,
      signKeys: signatureKeyPair,
      encryptionKeys: encryptionKeyPair,
      createdAt: unverifiedDeviceCreation.index,
      revokedAt: Number.MAX_SAFE_INTEGER
    };
    const testUser = { ...parentDevice.testUser };
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
    let block = blockGenerator.makeDeviceRevocationBlock(parentDevice.user, parentDevice.testUser.userKeys[parentDevice.testUser.userKeys.length - 1], utils.toBase64(deviceIdToRevoke));
    block = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(block)), index: this._trustchainIndex }));

    const unverifiedDeviceRevocation = ((userEntryFromBlock(block): any): DeviceRevocationEntry);

    const testUser = { ...parentDevice.testUser,
      devices: parentDevice.testUser.devices.map(d => {
        if (utils.equalArray(d.id, deviceIdToRevoke)) {
          return { ...d, revokedAt: unverifiedDeviceRevocation.index };
        }
        return { ...d };
      }),
      userKeys: [...parentDevice.testUser.userKeys]
    };

    // $FlowIKnow unverifiedDeviceRevocation.user_keys is not null
    const keyForParentDevice = find(unverifiedDeviceRevocation.user_keys.private_keys, key => utils.equalArray(key.recipient, parentDevice.testDevice.id));
    if (keyForParentDevice) {
      testUser.userKeys.push({
        // $FlowIKnow unverifiedDeviceRevocation.user_keys is not null
        publicKey: unverifiedDeviceRevocation.user_keys.public_encryption_key,
        privateKey: tcrypto.sealDecrypt(keyForParentDevice.key, parentDevice.testDevice.encryptionKeys),
        index: unverifiedDeviceRevocation.index
      });
    } else {
      testUser.userKeys.push({
        // $FlowIKnow unverifiedDeviceRevocation.user_keys is not null
        publicKey: unverifiedDeviceRevocation.user_keys.public_encryption_key,
        privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
        index: unverifiedDeviceRevocation.index
      });
    }

    return {
      unverifiedDeviceRevocation,
      block,
      testUser,
      user: this._testUserToUser(testUser)
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
    let block = blockGenerator.makeKeyPublishBlock(lastUserKey, resourceKey, resourceId, NATURE_KIND.key_publish_to_user);
    block = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(block)), index: this._trustchainIndex }));

    const keyPublish = getKeyPublishEntryFromBlock(block);
    return {
      keyPublish,
      block,
      resourceId,
      resourceKey
    };
  }

  makeKeyPublishToGroup = (parentDevice: TestDeviceCreation, recipient: Group): TestKeyPublish => {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;
    let block = blockGenerator.makeKeyPublishBlock(recipient.publicEncryptionKey, resourceKey, resourceId, NATURE_KIND.key_publish_to_user_group);
    block = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(block)), index: this._trustchainIndex }));

    const keyPublish = getKeyPublishEntryFromBlock(block);

    return {
      keyPublish,
      block,
      resourceId,
      resourceKey
    };
  }

  makeKeyPublishToProvisionalUser = (parentDevice: TestDeviceCreation, recipient: PublicProvisionalUser): TestKeyPublish => {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;

    let block = blockGenerator.makeKeyPublishToProvisionalUserBlock(recipient, resourceKey, resourceId);
    block = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(block)), index: this._trustchainIndex }));

    const keyPublish = getKeyPublishEntryFromBlock(block);
    return {
      keyPublish,
      block,
      resourceId,
      resourceKey
    };
  }

  makeProvisionalIdentityClaim = (parentDevice: TestDeviceCreation, userId: Uint8Array, userPublicKey: Uint8Array): TestIdentityClaim => {
    const provisionalIdentityPrivateKeys = {
      appSignatureKeyPair: tcrypto.makeSignKeyPair(),
      appEncryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
      tankerSignatureKeyPair: tcrypto.makeSignKeyPair(),
      tankerEncryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
    };
    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;
    let block = blockGenerator.makeProvisionalIdentityClaimBlock(userId, userPublicKey, provisionalIdentityPrivateKeys);
    block = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(block)), index: this._trustchainIndex }));

    return {
      unverifiedProvisionalIdentityClaim: provisionalIdentityClaimFromBlock(block),
      block,
    };
  }

  makeUserGroupCreation = (parentDevice: TestDeviceCreation, members: Array<User>, provisionalUsers?: Array<PublicProvisionalUser> = []): TestUserGroup => {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;
    let block = blockGenerator.createUserGroup(signatureKeyPair, encryptionKeyPair, members, provisionalUsers);
    block = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(block)), index: this._trustchainIndex }));

    const userGroupEntry = getGroupEntryFromBlock(block);
    const group = {
      groupId: signatureKeyPair.publicKey,
      publicSignatureKey: signatureKeyPair.publicKey,
      publicEncryptionKey: encryptionKeyPair.publicKey,
      signatureKeyPair,
      encryptionKeyPair,
      lastGroupBlock: userGroupEntry.hash,
      index: userGroupEntry.index,
    };

    return {
      userGroupEntry,
      block,
      group
    };
  }

  makeUserGroupAddition = (parentDevice: TestDeviceCreation, previousGroup: Group, newMembers: Array<User>, provisionalUsers: Array<PublicProvisionalUser> = []): TestUserGroup => {
    const blockGenerator = new BlockGenerator(
      this._trustchainId,
      parentDevice.testDevice.signKeys.privateKey,
      parentDevice.testDevice.id,
    );
    this._trustchainIndex += 1;

    const signatureKeyPair = previousGroup.signatureKeyPair || null;
    const encryptionKeyPair = previousGroup.encryptionKeyPair || null;
    if (!signatureKeyPair || !encryptionKeyPair) {
      throw new Error('This group has no key pairs!');
    }

    let block = blockGenerator.addToUserGroup(
      previousGroup.groupId,
      signatureKeyPair.privateKey,
      previousGroup.lastGroupBlock,
      encryptionKeyPair.privateKey,
      newMembers,
      provisionalUsers
    );
    block = utils.toBase64(serializeBlock({ ...unserializeBlock(utils.fromBase64(block)), index: this._trustchainIndex }));

    const userGroupEntry = getGroupEntryFromBlock(block);

    const group = { ...previousGroup };
    group.lastGroupBlock = userGroupEntry.hash;
    group.index = userGroupEntry.index;

    return {
      userGroupEntry,
      block,
      group,
    };
  }

  _testDeviceToDevice = (testDevice: TestDevice): Device => ({
    deviceId: testDevice.id,
    devicePublicEncryptionKey: testDevice.encryptionKeys.publicKey,
    devicePublicSignatureKey: testDevice.signKeys.publicKey,
    isGhostDevice: false,
    createdAt: testDevice.createdAt,
    revokedAt: testDevice.revokedAt,
  })

  _testUserToUser(user: TestUser): User {
    return {
      userId: user.id,
      userPublicKeys: user.userKeys ? user.userKeys.map(key => ({ index: key.index, userPublicKey: key.publicKey })) : [],
      devices: user.devices.map(this._testDeviceToDevice),
    };
  }

  _deviceCreationV1(deviceCreation: DeviceCreationEntry): DeviceCreationEntry {
    const deviceCreationV1 = { ...deviceCreation };
    deviceCreationV1.nature = NATURE.device_creation_v1;
    deviceCreationV1.user_key_pair = null;
    return deviceCreationV1;
  }
}
export default TestGenerator;
