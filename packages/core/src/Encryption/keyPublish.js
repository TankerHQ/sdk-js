// @flow

import { tcrypto, utils, type Key } from '@tanker/crypto';

import { flat } from '../internalUtils';
import { type Block } from '../Blocks/Block';
import BlockGenerator from '../Blocks/BlockGenerator';
import { isKeyPublishToDevice, isKeyPublishToUser, isKeyPublishToUserGroup } from '../Blocks/payloads';
import GroupStore from '../Groups/GroupStore';
import { type ExternalGroup } from '../Groups/types';
import { Client } from '../Network/Client';
import Keystore from '../Session/Keystore';
import SharedKeystore from './SharedKeys';
import UserAccessor from '../Users/UserAccessor';
import { type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import { type User, type Device, getLastUserPublicKey } from '../Users/UserStore';

export type KeyResourceId = {
  key: Uint8Array,
  resourceId: Uint8Array,
};

async function decryptResourceKey(keystore: Keystore, userAccessor: UserAccessor, groupStore: GroupStore, keyPublishEntry: VerifiedKeyPublish): Promise<?Uint8Array> {
  let resourceKey: Key;

  if (isKeyPublishToDevice(keyPublishEntry.nature)) {
    if (!keystore.deviceId || !utils.equalArray(keyPublishEntry.recipient, keystore.deviceId)) {
      return null;
    }
    const authorKey = await userAccessor.getDevicePublicEncryptionKey(keyPublishEntry.author);
    if (!authorKey)
      throw new Error('Assertion error: Key publish is verified, but can\'t find author\'s key!');
    return tcrypto.asymDecrypt(keyPublishEntry.key, authorKey, keystore.privateEncryptionKey);
  } else if (isKeyPublishToUser(keyPublishEntry.nature)) {
    const userKey = keystore.findUserKey(keyPublishEntry.recipient);
    if (!userKey)
      return null;
    resourceKey = tcrypto.sealDecrypt(keyPublishEntry.key, userKey);
  } else if (isKeyPublishToUserGroup(keyPublishEntry.nature)) {
    const group = await groupStore.findFull({ groupPublicEncryptionKey: keyPublishEntry.recipient });
    if (!group)
      return null;
    resourceKey = tcrypto.sealDecrypt(keyPublishEntry.key, group.encryptionKeyPair);
  } else {
    return null;
  }
  return resourceKey;
}

export async function processKeyPublish(
  keystore: Keystore,
  userAccessor: UserAccessor,
  groupStore: GroupStore,
  sharedKeystore: SharedKeystore,
  keyPublishEntry: VerifiedKeyPublish,
): Promise<?Key> {
  // ignore this block, our device doesn't exist yet so there's no way this resourceKey publish is for us
  if (!keystore.deviceId)
    return null;

  try {
    const resourceKey = await decryptResourceKey(keystore, userAccessor, groupStore, keyPublishEntry);
    if (resourceKey) {
      await sharedKeystore.saveResourceKey(keyPublishEntry.resourceId, resourceKey);
    }

    return resourceKey;
  } catch (err) {
    const b64Mac = utils.toBase64(keyPublishEntry.resourceId);
    console.error(`Cannot decrypt resource '${b64Mac}' resourceKey:`, err);
    throw err;
  }
}

function makeKeyPublishToGroupsBlocks(
  blockGenerator: BlockGenerator,
  keyResourceIds: Array<KeyResourceId>,
  groups: Array<ExternalGroup>
): Array<Block> {
  return flat(groups.map(group => keyResourceIds.map(({ key, resourceId }) => {
    const sharedKey = tcrypto.sealEncrypt(
      key,
      group.publicEncryptionKey,
    );

    const share = {
      recipient: group.publicEncryptionKey,
      resourceId,
      key: sharedKey,
    };
    return blockGenerator.keyPublishToUserGroup(share);
  })));
}

function makeKeyPublishToUsersBlocks(
  blockGenerator: BlockGenerator,
  keyResourceIds: Array<KeyResourceId>,
  users: Array<User>
): Array<Block> {
  return flat(users.map(user => {
    const userPublicKey = getLastUserPublicKey(user);
    if (!userPublicKey)
      throw new Error('Trying to share to a user without user public key');

    return keyResourceIds.map(({ key, resourceId }) => {
      const sharedKey = tcrypto.sealEncrypt(
        key,
        userPublicKey,
      );

      const share = {
        recipient: userPublicKey,
        resourceId,
        key: sharedKey,
      };
      return blockGenerator.keyPublishToUser(share);
    });
  }));
}

function makeKeyPublishToDevicesBlocks(
  blockGenerator: BlockGenerator,
  privateEncryptionKey: Key,
  keyResourceIds: Array<KeyResourceId>,
  devices: Array<Device>
): Array<Block> {
  return flat(devices.map(device => {
    if (device.revokedAt !== Number.MAX_SAFE_INTEGER)
      throw new Error('Trying to share with a revoked device');

    return keyResourceIds.map(({ resourceId, key }) => {
      const sharedKey = tcrypto.asymEncrypt(
        key,
        device.devicePublicEncryptionKey,
        privateEncryptionKey,
      );

      const share = {
        recipient: utils.fromBase64(device.deviceId),
        resourceId,
        key: sharedKey,
      };

      return blockGenerator.keyPublish(share);
    });
  }));
}

type UsersAndDevices = {
  users: Array<User>,
  devices: Array<Device>,
}

function getUsersAndDevices(users: Array<User>): UsersAndDevices {
  const usersWithUserKeys = [];
  const devices = [];

  for (const user of users) {
    if (user.userPublicKeys.length !== 0) {
      usersWithUserKeys.push(user);
    } else {
      devices.push(...user.devices.filter(d => d.revokedAt === Number.MAX_SAFE_INTEGER));
    }
  }

  return {
    users: usersWithUserKeys,
    devices,
  };
}

function makeBlockGenerator(trustchainId: Uint8Array, keystore: Keystore): BlockGenerator {
  if (!keystore.deviceId)
    throw new Error('Assertion error: device id is not set');

  return new BlockGenerator(
    trustchainId,
    keystore.privateSignatureKey,
    keystore.deviceId,
  );
}

export async function keyPublish(
  client: Client,
  keystore: Keystore,
  keyResourceIds: Array<KeyResourceId>,
  recipientUsers: Array<User>,
  recipientGroups: Array<ExternalGroup>
): Promise<void> {
  const { trustchainId } = client;
  const { users, devices } = getUsersAndDevices(recipientUsers);

  const generator = makeBlockGenerator(trustchainId, keystore);
  let blocks: Array<Block> = [];
  if (recipientGroups.length > 0)
    blocks = blocks.concat(makeKeyPublishToGroupsBlocks(generator, keyResourceIds, recipientGroups));
  if (users.length > 0)
    blocks = blocks.concat(makeKeyPublishToUsersBlocks(generator, keyResourceIds, users));
  if (devices.length > 0)
    blocks = blocks.concat(makeKeyPublishToDevicesBlocks(generator, keystore.privateEncryptionKey, keyResourceIds, devices));

  await client.sendKeyPublishBlocks(blocks);
}
