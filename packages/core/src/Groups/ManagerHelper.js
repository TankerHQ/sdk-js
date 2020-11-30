// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { GroupTooBig, InvalidArgument, InternalError } from '@tanker/errors';

import type { GroupEncryptedKey, ProvisionalGroupEncryptedKeyV2, ProvisionalGroupEncryptedKeyV3, UserGroupEntry } from './Serialize';
import { isInternalGroup, type Group, type ExternalGroup, type InternalGroup } from './types';
import { verifyGroupAction } from './Verify';

import { type ProvisionalUserKeyPairs } from '../LocalUser/KeySafe';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';
import LocalUser from '../LocalUser/LocalUser';

export const MAX_GROUP_SIZE = 1000;

export type GroupData = Array<{|
  entry: UserGroupEntry,
  group: Group,
|}>;

export type GroupDataWithDevices = Array<{|
  entry: UserGroupEntry,
  group: Group,
  devicePublicSignatureKey: Uint8Array
|}>;

export function assertPublicIdentities(publicIdentities: Array<b64string>) {
  if (publicIdentities.length === 0)
    throw new InvalidArgument('publicIdentities', 'non empty Array<b64string>', '[]');
  if (publicIdentities.length > MAX_GROUP_SIZE)
    throw new GroupTooBig(`A group cannot have more than ${MAX_GROUP_SIZE} members`);
}

export function assertExpectedGroups(groups: Array<Group>, expectedGroupIds: Array<Uint8Array>) {
  const missingGroupIds = [];
  for (const groupId of expectedGroupIds) {
    const fetchedGroup = groups.find(group => utils.equalArray(group.groupId, groupId));
    if (!fetchedGroup) {
      missingGroupIds.push(utils.toBase64(groupId));
    }
  }
  if (missingGroupIds.length > 0) {
    const message = `The following groups do not exist on the trustchain: "${missingGroupIds.join('", "')}"`;
    throw new InvalidArgument(message);
  }
}

export function assertExpectedGroupsByPublicKey(groups: Array<Group>, expectedGroupPublicKey: Uint8Array) {
  if (groups.length !== 1 || !utils.equalArray(groups[0].publicEncryptionKey, expectedGroupPublicKey)) {
    const message = `The following group do not exist on the trustchain. Public encryption key: "${utils.toBase64(expectedGroupPublicKey)}"`;
    throw new InvalidArgument(message);
  }
}

function findMyUserKeys(groupKeys: $ReadOnlyArray<GroupEncryptedKey>, localUser: LocalUser): ?Object {
  for (const gek of groupKeys) {
    const correspondingPair = localUser.findUserKey(gek.public_user_encryption_key);
    if (correspondingPair) {
      return {
        userKeyPair: correspondingPair,
        groupEncryptedKey: gek.encrypted_group_private_encryption_key,
      };
    }
  }
  return null;
}

async function findMyProvisionalKeys(groupKeys: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2 | ProvisionalGroupEncryptedKeyV3>, provisionalIdentityManager: ProvisionalIdentityManager): Promise<?Object> {
  // Refresh only once (i.e. a single API call), then loop to find our provisional keys
  await provisionalIdentityManager.refreshProvisionalPrivateKeys();

  for (const gek of groupKeys) {
    const correspondingPair = provisionalIdentityManager.findPrivateProvisionalKeys(gek.app_provisional_user_public_signature_key, gek.tanker_provisional_user_public_signature_key);
    if (correspondingPair) {
      return {
        provisionalKeyPair: correspondingPair,
        groupEncryptedKey: gek.encrypted_group_private_encryption_key,
      };
    }
  }

  return null;
}

function provisionalUnseal(ciphertext: Uint8Array, keys: ProvisionalUserKeyPairs): Uint8Array {
  const intermediate = tcrypto.sealDecrypt(ciphertext, keys.tankerEncryptionKeyPair);
  return tcrypto.sealDecrypt(intermediate, keys.appEncryptionKeyPair);
}

async function findGroupPrivateEncryptionKey(entry: UserGroupEntry, localUser: LocalUser, provisionalIdentityManager: ProvisionalIdentityManager): Promise<?Uint8Array> {
  const userKeys = findMyUserKeys(entry.encrypted_group_private_encryption_keys_for_users, localUser);

  if (userKeys) {
    return tcrypto.sealDecrypt(userKeys.groupEncryptedKey, userKeys.userKeyPair);
  }

  if (entry.encrypted_group_private_encryption_keys_for_provisional_users) {
    const provisionalKeys = await findMyProvisionalKeys(entry.encrypted_group_private_encryption_keys_for_provisional_users, provisionalIdentityManager);
    if (provisionalKeys) {
      return provisionalUnseal(provisionalKeys.groupEncryptedKey, provisionalKeys.provisionalKeyPair);
    }
  }
}

function externalToInternal(externalGroup: ExternalGroup, groupPrivateEncryptionKey: Uint8Array): InternalGroup {
  const { encryptedPrivateSignatureKey, ...groupBase } = externalGroup;
  const groupPrivateSignatureKey = tcrypto.sealDecrypt(encryptedPrivateSignatureKey, { publicKey: groupBase.publicEncryptionKey, privateKey: groupPrivateEncryptionKey });

  return {
    ...groupBase,
    signatureKeyPair: {
      publicKey: groupBase.publicSignatureKey,
      privateKey: groupPrivateSignatureKey,
    },
    encryptionKeyPair: {
      publicKey: groupBase.publicEncryptionKey,
      privateKey: groupPrivateEncryptionKey,
    }
  };
}

export async function groupFromUserGroupEntry(
  entry: UserGroupEntry,
  previousGroup: ?Group,
  localUser: LocalUser,
  provisionalIdentityManager: ProvisionalIdentityManager
): Promise<Group> {
  // Previous group already has every field we need
  if (previousGroup && isInternalGroup(previousGroup)) {
    return {
      ...previousGroup,
      lastGroupBlock: entry.hash,
    };
  }

  // Extract info from external group or UserGroupCreationEntry
  const groupId = previousGroup && previousGroup.groupId || entry.public_signature_key && entry.public_signature_key;
  const publicSignatureKey = previousGroup && previousGroup.publicSignatureKey || entry.public_signature_key && entry.public_signature_key;
  const publicEncryptionKey = previousGroup && previousGroup.publicEncryptionKey || entry.public_encryption_key && entry.public_encryption_key;
  const encryptedPrivateSignatureKey = previousGroup && previousGroup.encryptedPrivateSignatureKey || entry.encrypted_group_private_signature_key && entry.encrypted_group_private_signature_key;
  if (!groupId || !publicSignatureKey || !publicEncryptionKey || !encryptedPrivateSignatureKey) {
    throw new InternalError('Assertion error: invalid group/entry combination');
  }

  const externalGroup = {
    groupId,
    publicSignatureKey,
    publicEncryptionKey,
    lastGroupBlock: entry.hash,
    encryptedPrivateSignatureKey,
  };

  const groupPrivateEncryptionKey = await findGroupPrivateEncryptionKey(entry, localUser, provisionalIdentityManager);

  // If found, return an internal group
  if (groupPrivateEncryptionKey) {
    return externalToInternal(externalGroup, groupPrivateEncryptionKey);
  }

  // Return an external group
  return externalGroup;
}

export function verifyGroup(groupDataWithDevices: GroupDataWithDevices) {
  let previousGroup;
  groupDataWithDevices.forEach(g => {
    verifyGroupAction(g.entry, g.devicePublicSignatureKey, previousGroup);
    previousGroup = g.group;
  });
}

export async function groupsFromEntries(entries: Array<UserGroupEntry>, devicePublicSignatureKeyMap: Map<b64string, Uint8Array>, localUser: LocalUser, provisionalIdentityManager: ProvisionalIdentityManager): Promise<Array<Group>> {
  const groupsMap: Map<b64string, GroupDataWithDevices> = new Map();

  for (const entry of entries) {
    const b64groupId = utils.toBase64(entry.group_id ? entry.group_id : entry.public_signature_key);
    const previousData: GroupDataWithDevices = groupsMap.get(b64groupId) || [];
    const previousGroup = previousData.length ? previousData[previousData.length - 1].group : null;

    const group = await groupFromUserGroupEntry(entry, previousGroup, localUser, provisionalIdentityManager);
    const devicePublicSignatureKey = devicePublicSignatureKeyMap.get(utils.toBase64(entry.author));
    if (!devicePublicSignatureKey) {
      throw new InternalError('author device publicSignatureKey missing');
    }
    previousData.push({ group, entry, devicePublicSignatureKey });

    groupsMap.set(b64groupId, previousData);
  }

  const groups: Array<Group> = [];
  for (const groupData of groupsMap.values()) {
    verifyGroup(groupData);
    groups.push(groupData[groupData.length - 1].group);
  }
  return groups;
}
