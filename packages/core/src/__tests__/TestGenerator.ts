import type { b64string } from '@tanker/crypto';
import { tcrypto, utils, random } from '@tanker/crypto';
import type { PublicProvisionalUser } from '@tanker/identity';
import { createIdentity, getPublicIdentity } from '@tanker/identity';

import type { ClaimEntry } from '../ProvisionalIdentity/Serialize';
import {
  provisionalIdentityClaimFromBlock,
  makeProvisionalIdentityClaim,
} from '../ProvisionalIdentity/Serialize';

import type { TrustchainCreationEntry } from '../LocalUser/Serialize';
import { trustchainCreationFromBlock } from '../LocalUser/Serialize';
import type { DeviceCreationEntry, DeviceRevocationEntry } from '../Users/Serialize';
import { userEntryFromBlock } from '../Users/Serialize';
import type { UserGroupEntry } from '../Groups/Serialize';
import { getGroupEntryFromBlock, makeUserGroupCreation, makeUserGroupAdditionV2, makeUserGroupAdditionV3 } from '../Groups/Serialize';
import type { KeyPublishEntry } from '../Resources/Serialize';
import { getKeyPublishEntryFromBlock, makeKeyPublish, makeKeyPublishToProvisionalUser } from '../Resources/Serialize';

import { hashBlock, createBlock } from '../Blocks/Block';
import { serializeBlock } from '../Blocks/payloads';
import { NATURE_KIND, preferredNature } from '../Blocks/Nature';

import type { User, Device } from '../Users/types';
import { getLastUserPublicKey } from '../Users/types';
import type { Group } from '../Groups/types';

import { rootBlockAuthor } from '../LocalUser/Verify';

import type { GhostDevice } from '../LocalUser/ghostDevice';
import { generateGhostDeviceKeys } from '../LocalUser/ghostDevice';
import { generateUserCreation, generateDeviceFromGhostDevice, makeDeviceRevocation } from '../LocalUser/UserCreation';

import type { DelegationToken } from '../LocalUser/UserData';

export type TestDevice = {
  id: Uint8Array;
  signKeys: tcrypto.SodiumKeyPair;
  encryptionKeys: tcrypto.SodiumKeyPair;
  revoked: boolean;
  isGhost: boolean;
};

export type TestProvisionalUser = {
  trustchainId: Uint8Array;
  target: string;
  value: string;
  appSignaturePublicKey: Uint8Array;
  appEncryptionPublicKey: Uint8Array;
  tankerSignaturePublicKey: Uint8Array;
  tankerEncryptionPublicKey: Uint8Array;
};

type TestUserKeys = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

export type TestUser = {
  id: Uint8Array;
  userKeys: Array<TestUserKeys>;
  devices: Array<TestDevice>;
  ghostDevice: GhostDevice;
  identity: string;
  publicIdentity: string;
};

export type TestTrustchainCreation = {
  unverifiedTrustchainCreation: TrustchainCreationEntry;
  block: b64string;
  trustchainId: Uint8Array;
  trustchainKeys: tcrypto.SodiumKeyPair;
};

export type TestDeviceCreation = {
  unverifiedDeviceCreation: DeviceCreationEntry;
  block: b64string;
  testUser: TestUser;
  testDevice: TestDevice;
  user: User;
};

export type TestDeviceRevocation = {
  unverifiedDeviceRevocation: DeviceRevocationEntry;
  block: b64string;
  testUser: TestUser;
  user: User;
};

export type TestKeyPublish = {
  block: b64string;
  keyPublish: KeyPublishEntry;
  resourceId: Uint8Array;
  resourceKey: Uint8Array;
};

export type TestUserGroup = {
  userGroupEntry: UserGroupEntry;
  block: b64string;
  group: Group;
};

export type TestIdentityClaim = {
  unverifiedProvisionalIdentityClaim: ClaimEntry;
  block: b64string;
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
  _trustchainKeys!: tcrypto.SodiumKeyPair;
  _trustchainId!: Uint8Array;
  makeTrustchainCreation = (): TestTrustchainCreation => {
    this._trustchainKeys = tcrypto.makeSignKeyPair();
    this._trustchainIndex += 1;
    const rootBlock = {
      trustchain_id: new Uint8Array(0),
      nature: preferredNature(NATURE_KIND.trustchain_creation),
      author: rootBlockAuthor,
      payload: this._trustchainKeys.publicKey,
      signature: new Uint8Array(tcrypto.SIGNATURE_SIZE),
    };

    rootBlock.trustchain_id = hashBlock(rootBlock);
    const block = utils.toBase64(serializeBlock(rootBlock));
    const unverifiedTrustchainCreation: TrustchainCreationEntry = trustchainCreationFromBlock(block);

    this._trustchainId = rootBlock.trustchain_id;
    return {
      unverifiedTrustchainCreation,
      block,
      trustchainId: rootBlock.trustchain_id,
      trustchainKeys: this._trustchainKeys,
    };
  };

  skipIndex = () => {
    this._trustchainIndex += 1;
  };

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
      },
    };
  };

  makeUserCreation = async (userId: Uint8Array): Promise<TestDeviceCreation> => {
    const delegationToken = createDelegationToken(userId, this._trustchainKeys.privateKey);
    const ghostDeviceKeys = generateGhostDeviceKeys();

    const { userCreationBlock, ghostDevice } = generateUserCreation(this._trustchainId, userId, ghostDeviceKeys, delegationToken);
    const unverifiedDeviceCreation = userEntryFromBlock(userCreationBlock) as DeviceCreationEntry;

    const privateUserKey = tcrypto.sealDecrypt(unverifiedDeviceCreation.user_key_pair.encrypted_private_encryption_key, ghostDeviceKeys.encryptionKeyPair);

    const testDevice: TestDevice = {
      id: unverifiedDeviceCreation.hash,
      signKeys: ghostDeviceKeys.signatureKeyPair,
      encryptionKeys: ghostDeviceKeys.encryptionKeyPair,
      revoked: false,
      isGhost: true,
    };
    const identity = await createIdentity(utils.toBase64(this._trustchainId), utils.toBase64(this._trustchainKeys.privateKey), utils.toBase64(userId));
    const publicIdentity = await getPublicIdentity(identity);

    const testUser: TestUser = {
      id: userId,
      userKeys: [{
        publicKey: unverifiedDeviceCreation.user_key_pair.public_encryption_key,
        privateKey: privateUserKey,
      }],
      devices: [testDevice],
      ghostDevice,
      identity,
      publicIdentity,
    };

    return {
      unverifiedDeviceCreation,
      block: userCreationBlock,
      testUser,
      testDevice,
      user: this._testUserToUser(testUser),
    };
  };

  makeDeviceCreation = (parentDevice: TestDeviceCreation): TestDeviceCreation => {
    const testUserKeys = parentDevice.testUser.userKeys[parentDevice.testUser.userKeys.length - 1]!;
    const userKeys = { publicKey: testUserKeys.publicKey, privateKey: testUserKeys.privateKey };

    const newDevice = generateDeviceFromGhostDevice(this._trustchainId, parentDevice.testUser.id, parentDevice.testUser.ghostDevice, parentDevice.testUser.devices[0]!.id, userKeys);
    const newDeviceBlock = newDevice.block;

    const unverifiedDeviceCreation = userEntryFromBlock(newDeviceBlock) as DeviceCreationEntry;

    const testDevice: TestDevice = {
      id: unverifiedDeviceCreation.hash,
      signKeys: newDevice.signatureKeyPair,
      encryptionKeys: newDevice.encryptionKeyPair,
      revoked: false,
      isGhost: false,
    };
    const testUser = { ...parentDevice.testUser };
    testUser.devices.push(testDevice);

    return {
      unverifiedDeviceCreation,
      block: newDeviceBlock,
      testUser,
      testDevice,
      user: this._testUserToUser(testUser),
    };
  };

  makeDeviceRevocation = (parentDevice: TestDeviceCreation, deviceIdToRevoke: Uint8Array): TestDeviceRevocation => {
    const refreshedDevices = this._testUserToUser(parentDevice.testUser).devices;
    const { payload, nature } = makeDeviceRevocation(refreshedDevices, parentDevice.testUser.userKeys[parentDevice.testUser.userKeys.length - 1]!, deviceIdToRevoke);

    this._trustchainIndex += 1;
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);
    const unverifiedDeviceRevocation = userEntryFromBlock(block) as DeviceRevocationEntry;

    const testUser = { ...parentDevice.testUser,
      devices: parentDevice.testUser.devices.map(d => {
        if (utils.equalArray(d.id, deviceIdToRevoke)) {
          return { ...d, revoked: true };
        }
        return { ...d };
      }),
      userKeys: [...parentDevice.testUser.userKeys],
    };

    const keyForParentDevice = unverifiedDeviceRevocation.user_keys!.private_keys.find(key => utils.equalArray(key.recipient, parentDevice.testDevice.id));

    if (keyForParentDevice) {
      testUser.userKeys.push({
        publicKey: unverifiedDeviceRevocation.user_keys!.public_encryption_key,
        privateKey: tcrypto.sealDecrypt(keyForParentDevice.key, parentDevice.testDevice.encryptionKeys),
      });
    } else {
      testUser.userKeys.push({
        publicKey: unverifiedDeviceRevocation.user_keys!.public_encryption_key,
        privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
      });
    }

    return {
      unverifiedDeviceRevocation,
      block,
      testUser,
      user: this._testUserToUser(testUser),
    };
  };

  makeKeyPublishToUser = (parentDevice: TestDeviceCreation, recipient: User): TestKeyPublish => {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);
    const lastUserKey = getLastUserPublicKey(recipient);

    if (!lastUserKey) {
      throw new Error('flow check');
    }
    const { payload, nature } = makeKeyPublish(lastUserKey, resourceKey, resourceId, NATURE_KIND.key_publish_to_user);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);
    const keyPublish = getKeyPublishEntryFromBlock(block);

    return {
      keyPublish,
      block,
      resourceId,
      resourceKey,
    };
  };

  makeKeyPublishToGroup = (parentDevice: TestDeviceCreation, recipient: Group): TestKeyPublish => {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    const { payload, nature } = makeKeyPublish(recipient.lastPublicEncryptionKey, resourceKey, resourceId, NATURE_KIND.key_publish_to_user_group);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);
    const keyPublish = getKeyPublishEntryFromBlock(block);

    return {
      keyPublish,
      block,
      resourceId,
      resourceKey,
    };
  };

  makeKeyPublishToProvisionalUser = (parentDevice: TestDeviceCreation, recipient: PublicProvisionalUser): TestKeyPublish => {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    const { payload, nature } = makeKeyPublishToProvisionalUser(recipient, resourceKey, resourceId);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);
    const keyPublish = getKeyPublishEntryFromBlock(block);

    return {
      keyPublish,
      block,
      resourceId,
      resourceKey,
    };
  };

  makeProvisionalIdentityClaim = (parentDevice: TestDeviceCreation, userId: Uint8Array, userPublicKey: Uint8Array): TestIdentityClaim => {
    const provisionalIdentityPrivateKeys = {
      appSignatureKeyPair: tcrypto.makeSignKeyPair(),
      appEncryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
      tankerSignatureKeyPair: tcrypto.makeSignKeyPair(),
      tankerEncryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
    };

    const { payload, nature } = makeProvisionalIdentityClaim(userId, parentDevice.testDevice.id, userPublicKey, provisionalIdentityPrivateKeys);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);

    return {
      unverifiedProvisionalIdentityClaim: provisionalIdentityClaimFromBlock(block),
      block,
    };
  };

  makeUserGroupCreation = (parentDevice: TestDeviceCreation, members: Array<User>, provisionalUsers: Array<PublicProvisionalUser> = []): TestUserGroup => {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();

    const { payload, nature } = makeUserGroupCreation(signatureKeyPair, encryptionKeyPair, members, provisionalUsers);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);

    const userGroupEntry = getGroupEntryFromBlock(block);
    const group = {
      groupId: signatureKeyPair.publicKey,
      lastPublicSignatureKey: signatureKeyPair.publicKey,
      lastPublicEncryptionKey: encryptionKeyPair.publicKey,
      signatureKeyPairs: [signatureKeyPair],
      encryptionKeyPairs: [encryptionKeyPair],
      lastGroupBlock: userGroupEntry.hash,
    };

    return {
      userGroupEntry,
      block,
      group,
    };
  };

  makeUserGroupAdditionV2 = (parentDevice: TestDeviceCreation, previousGroup: Group, newMembers: Array<User>, provisionalUsers: Array<PublicProvisionalUser> = []): TestUserGroup => {
    const signatureKeyPair = 'signatureKeyPairs' in previousGroup ? previousGroup.signatureKeyPairs[0] : null;
    const encryptionKeyPair = 'encryptionKeyPairs' in previousGroup ? previousGroup.encryptionKeyPairs[0] : null;
    if (!signatureKeyPair || !encryptionKeyPair) {
      throw new Error('This group has no key pairs!');
    }

    this._trustchainIndex += 1;
    const { payload, nature } = makeUserGroupAdditionV2(
      previousGroup.groupId,
      signatureKeyPair.privateKey,
      previousGroup.lastGroupBlock,
      encryptionKeyPair.privateKey,
      newMembers,
      provisionalUsers,
    );
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);
    const userGroupEntry = getGroupEntryFromBlock(block);

    const group = { ...previousGroup };
    group.lastGroupBlock = userGroupEntry.hash;

    return {
      userGroupEntry,
      block,
      group,
    };
  };

  makeUserGroupAdditionV3 = (parentDevice: TestDeviceCreation, previousGroup: Group, newMembers: Array<User>, provisionalUsers: Array<PublicProvisionalUser> = []): TestUserGroup => {
    const signatureKeyPair = 'signatureKeyPairs' in previousGroup ? previousGroup.signatureKeyPairs[0] : null;
    const encryptionKeyPair = 'encryptionKeyPairs' in previousGroup ? previousGroup.encryptionKeyPairs[0] : null;

    if (!signatureKeyPair || !encryptionKeyPair) {
      throw new Error('This group has no key pairs!');
    }

    this._trustchainIndex += 1;
    const { payload, nature } = makeUserGroupAdditionV3(
      previousGroup.groupId,
      signatureKeyPair.privateKey,
      previousGroup.lastGroupBlock,
      encryptionKeyPair.privateKey,
      newMembers,
      provisionalUsers,
    );
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);
    const userGroupEntry = getGroupEntryFromBlock(block);

    const group = { ...previousGroup };
    group.lastGroupBlock = userGroupEntry.hash;

    return {
      userGroupEntry,
      block,
      group,
    };
  };

  _testDeviceToDevice = (testDevice: TestDevice): Device => ({
    deviceId: testDevice.id,
    devicePublicEncryptionKey: testDevice.encryptionKeys.publicKey,
    devicePublicSignatureKey: testDevice.signKeys.publicKey,
    revoked: testDevice.revoked,
    isGhostDevice: testDevice.isGhost,
  });

  _testUserToUser(user: TestUser): User {
    return {
      userId: user.id,
      userPublicKeys: user.userKeys.map(key => key.publicKey),
      devices: user.devices.map(device => this._testDeviceToDevice(device)),
    };
  }
}

export default TestGenerator;
