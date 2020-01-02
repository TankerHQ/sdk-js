// @flow
import find from 'array-find';
import { tcrypto, utils, random, type b64string } from '@tanker/crypto';
import { type PublicProvisionalUser, createIdentity, getPublicIdentity } from '@tanker/identity';

import {
  provisionalIdentityClaimFromBlock,
  makeProvisionalIdentityClaim,
  type ClaimEntry,
} from '../Session/ProvisionalIdentity/Serialize';

import { type TrustchainCreationEntry, trustchainCreationFromBlock } from '../Session/LocalUser/Serialize';
import { userEntryFromBlock, type DeviceCreationEntry, type DeviceRevocationEntry } from '../Users/Serialize';
import { type UserGroupEntry, getGroupEntryFromBlock, makeUserGroupCreation, makeUserGroupAddition } from '../Groups/Serialize';
import { type KeyPublishEntry, getKeyPublishEntryFromBlock, makeKeyPublish, makeKeyPublishToProvisionalUser } from '../DataProtection/Resource/Serialize';

import { hashBlock, createBlock } from '../Blocks/Block';
import { serializeBlock } from '../Blocks/payloads';
import { NATURE_KIND, preferredNature } from '../Blocks/Nature';

import { getLastUserPublicKey, type User, type Device } from '../Users/types';
import { type Group } from '../Groups/types';

import { rootBlockAuthor } from '../Session/LocalUser/Verify';

import { generateGhostDeviceKeys, type GhostDevice } from '../Session/LocalUser/ghostDevice';
import { generateUserCreation, generateDeviceFromGhostDevice, makeDeviceRevocation } from '../Session/LocalUser/UserCreation';

import { type DelegationToken } from '../Session/LocalUser/UserData';


export type TestDevice = {
  id: Uint8Array,
  signKeys: tcrypto.SodiumKeyPair,
  encryptionKeys: tcrypto.SodiumKeyPair,
  revoked: bool;
  isGhost: bool;
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
  publicKey: Uint8Array,
  privateKey: Uint8Array,
}

export type TestUser = {
  id: Uint8Array,
  userKeys: Array<TestUserKeys>,
  devices: Array<TestDevice>,
  ghostDevice: GhostDevice,
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
    const deviceSignatureKeyPair = tcrypto.makeSignKeyPair();
    const deviceEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const delegationToken = createDelegationToken(userId, this._trustchainKeys.privateKey);
    const ghostDeviceKeys = generateGhostDeviceKeys();

    const { userCreationBlock, ghostDevice } = generateUserCreation(this._trustchainId, userId, deviceEncryptionKeyPair, deviceSignatureKeyPair, ghostDeviceKeys, delegationToken);
    const unverifiedDeviceCreation = ((userEntryFromBlock(userCreationBlock): any): DeviceCreationEntry);

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
      user: this._testUserToUser(testUser)
    };
  }

  makeDeviceCreation = (parentDevice: TestDeviceCreation): TestDeviceCreation => {
    const deviceSignatureKeyPair = tcrypto.makeSignKeyPair();
    const deviceEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const testUserKeys = parentDevice.testUser.userKeys[parentDevice.testUser.userKeys.length - 1];
    const userKeys = { publicKey: testUserKeys.publicKey, privateKey: testUserKeys.privateKey };

    const newDeviceBlock = generateDeviceFromGhostDevice(this._trustchainId, parentDevice.testUser.id, deviceEncryptionKeyPair, deviceSignatureKeyPair, parentDevice.testUser.ghostDevice, parentDevice.testUser.devices[0].id, userKeys);

    const unverifiedDeviceCreation = ((userEntryFromBlock(newDeviceBlock): any): DeviceCreationEntry);

    const testDevice: TestDevice = {
      id: unverifiedDeviceCreation.hash,
      signKeys: deviceSignatureKeyPair,
      encryptionKeys: deviceEncryptionKeyPair,
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
      user: this._testUserToUser(testUser)
    };
  }

  makeDeviceRevocation = (parentDevice: TestDeviceCreation, deviceIdToRevoke: Uint8Array): TestDeviceRevocation => {
    const { payload, nature } = makeDeviceRevocation(parentDevice.user.devices, parentDevice.testUser.userKeys[parentDevice.testUser.userKeys.length - 1], deviceIdToRevoke);

    this._trustchainIndex += 1;
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);
    const unverifiedDeviceRevocation = ((userEntryFromBlock(block): any): DeviceRevocationEntry);

    const testUser = { ...parentDevice.testUser,
      devices: parentDevice.testUser.devices.map(d => {
        if (utils.equalArray(d.id, deviceIdToRevoke)) {
          return { ...d, revoked: true };
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
      });
    } else {
      testUser.userKeys.push({
        // $FlowIKnow unverifiedDeviceRevocation.user_keys is not null
        publicKey: unverifiedDeviceRevocation.user_keys.public_encryption_key,
        privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
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
      resourceKey
    };
  }

  makeKeyPublishToGroup = (parentDevice: TestDeviceCreation, recipient: Group): TestKeyPublish => {
    const resourceKey = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = random(tcrypto.MAC_SIZE);

    const { payload, nature } = makeKeyPublish(recipient.publicEncryptionKey, resourceKey, resourceId, NATURE_KIND.key_publish_to_user_group);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);

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

    const { payload, nature } = makeKeyPublishToProvisionalUser(recipient, resourceKey, resourceId);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);

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

    const { payload, nature } = makeProvisionalIdentityClaim(userId, parentDevice.testDevice.id, userPublicKey, provisionalIdentityPrivateKeys);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);

    return {
      unverifiedProvisionalIdentityClaim: provisionalIdentityClaimFromBlock(block),
      block,
    };
  }

  makeUserGroupCreation = (parentDevice: TestDeviceCreation, members: Array<User>, provisionalUsers?: Array<PublicProvisionalUser> = []): TestUserGroup => {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();

    const { payload, nature } = makeUserGroupCreation(signatureKeyPair, encryptionKeyPair, members, provisionalUsers);
    const { block } = createBlock(payload, nature, this._trustchainId, parentDevice.testDevice.id, parentDevice.testDevice.signKeys.privateKey);

    const userGroupEntry = getGroupEntryFromBlock(block);
    const group = {
      groupId: signatureKeyPair.publicKey,
      publicSignatureKey: signatureKeyPair.publicKey,
      publicEncryptionKey: encryptionKeyPair.publicKey,
      signatureKeyPair,
      encryptionKeyPair,
      lastGroupBlock: userGroupEntry.hash,
    };

    return {
      userGroupEntry,
      block,
      group
    };
  }

  makeUserGroupAddition = (parentDevice: TestDeviceCreation, previousGroup: Group, newMembers: Array<User>, provisionalUsers: Array<PublicProvisionalUser> = []): TestUserGroup => {
    const signatureKeyPair = previousGroup.signatureKeyPair || null;
    const encryptionKeyPair = previousGroup.encryptionKeyPair || null;
    if (!signatureKeyPair || !encryptionKeyPair) {
      throw new Error('This group has no key pairs!');
    }

    this._trustchainIndex += 1;
    const { payload, nature } = makeUserGroupAddition(
      previousGroup.groupId,
      signatureKeyPair.privateKey,
      previousGroup.lastGroupBlock,
      encryptionKeyPair.privateKey,
      newMembers,
      provisionalUsers
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
  }

  _testDeviceToDevice = (testDevice: TestDevice): Device => ({
    deviceId: testDevice.id,
    devicePublicEncryptionKey: testDevice.encryptionKeys.publicKey,
    devicePublicSignatureKey: testDevice.signKeys.publicKey,
    revoked: testDevice.revoked,
    isGhostDevice: testDevice.isGhost,
  })

  _testUserToUser(user: TestUser): User {
    return {
      userId: user.id,
      userPublicKeys: user.userKeys.map(key => (key.publicKey)),
      devices: user.devices.map(this._testDeviceToDevice),
    };
  }
}
export default TestGenerator;
