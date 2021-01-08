// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { GroupTooBig, InvalidArgument, InternalError, UnsupportedGroupVersion } from '@tanker/errors';

import type { PublicPermanentIdentity, PublicProvisionalUser } from '@tanker/identity';
import type { GroupEncryptedKey, GroupEncryptedKeyV2, ProvisionalGroupEncryptedKeyV2, ProvisionalGroupEncryptedKeyV3, UserGroupEntry } from './Serialize';
import { isGroupAddition, isGroupUpdate, getUserGroupEntryVersion, getGroupEntryFromBlock, decryptPreviousGroupKey } from './Serialize';
import { isInternalGroup, type Group, type ExternalGroup, type InternalGroup } from './types';
import { natureKind, NATURE_KIND } from '../Blocks/Nature';

import { verifyGroupAction } from './Verify';

import { type ProvisionalUserKeyPairs } from '../LocalUser/KeySafe';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';
import LocalUser from '../LocalUser/LocalUser';
import { type User } from '../Users/types';

export const MAX_GROUP_MEMBERS_PER_OPERATION = 1000;

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
  if (publicIdentities.length > MAX_GROUP_MEMBERS_PER_OPERATION)
    throw new GroupTooBig(`You cannot add more than ${MAX_GROUP_MEMBERS_PER_OPERATION} members at once to a group`);
}

export function assertMembersToRemoveGroupUpdate(usersInGroup: Array<User>, provisionalUsersInGroup: Array<ProvisionalGroupEncryptedKeyV3>,
  usersToRemove: Array<{b64publicIdentity: b64string, publicPermanentIdentity: PublicPermanentIdentity}>, provisionalUsersToRemove: Array<{b64publicIdentity: b64string, publicProvisionalUser: PublicProvisionalUser}>,
  usersToAdd: Array<User>, provisionalUsersToAdd: Array<PublicProvisionalUser>) {
  const b64UsersInGroup = new Set(usersInGroup.map(user => utils.toBase64(user.userId)));
  const b64UsersToAdd = new Set(usersToAdd.map(user => utils.toBase64(user.userId)));
  const notFoundIdentities: Array<b64string> = [];
  const userBothAddedAndRemoved: Array<b64string> = [];
  for (const userToRemove of usersToRemove) {
    const userToRemoveId = userToRemove.publicPermanentIdentity.value;
    if (!b64UsersInGroup.has(userToRemoveId)) {
      notFoundIdentities.push(userToRemove.b64publicIdentity);
    }

    if (b64UsersToAdd.has(userToRemoveId)) {
      userBothAddedAndRemoved.push(userToRemove.b64publicIdentity);
    }
  }

  const b64ProvisionalUsersInGroupKeys = new Set(provisionalUsersInGroup.map(provisionalUser => utils.toBase64(utils.concatArrays(provisionalUser.app_provisional_user_public_signature_key, provisionalUser.tanker_provisional_user_public_signature_key))));
  const b64ProvisionalUsersToAddKeys = new Set(provisionalUsersToAdd.map(provisionalUser => utils.toBase64(utils.concatArrays(provisionalUser.appSignaturePublicKey, provisionalUser.tankerSignaturePublicKey))));
  for (const provisionalUserToRemove of provisionalUsersToRemove) {
    const provisionalUserKeys = utils.toBase64(utils.concatArrays(provisionalUserToRemove.publicProvisionalUser.appSignaturePublicKey, provisionalUserToRemove.publicProvisionalUser.tankerSignaturePublicKey));
    if (!b64ProvisionalUsersInGroupKeys.has(provisionalUserKeys)) {
      notFoundIdentities.push(provisionalUserToRemove.b64publicIdentity);
    }

    if (b64ProvisionalUsersToAddKeys.has(provisionalUserKeys)) {
      userBothAddedAndRemoved.push(provisionalUserToRemove.b64publicIdentity);
    }
  }

  if (notFoundIdentities.length !== 0) {
    throw new InvalidArgument(`The identities ${notFoundIdentities.join(', ')} don't exist in this group.`);
  }

  if (userBothAddedAndRemoved.length !== 0) {
    throw new InvalidArgument(`The identities ${userBothAddedAndRemoved.join(', ')} are both added to and removed from the group.`);
  }
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

function findMyProvisionalKeys(groupKeys: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2 | ProvisionalGroupEncryptedKeyV3>, provisionalIdentityManager: ProvisionalIdentityManager): ?Object {
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

function findGroupPrivateEncryptionKey(entry: UserGroupEntry, localUser: LocalUser, provisionalIdentityManager: ProvisionalIdentityManager): ?Uint8Array {
  const userKeys = findMyUserKeys(entry.encrypted_group_private_encryption_keys_for_users, localUser);

  if (userKeys) {
    return tcrypto.sealDecrypt(userKeys.groupEncryptedKey, userKeys.userKeyPair);
  }

  if (entry.encrypted_group_private_encryption_keys_for_provisional_users) {
    const provisionalKeys = findMyProvisionalKeys(entry.encrypted_group_private_encryption_keys_for_provisional_users, provisionalIdentityManager);
    if (provisionalKeys) {
      return provisionalUnseal(provisionalKeys.groupEncryptedKey, provisionalKeys.provisionalKeyPair);
    }
  }
}

function externalToInternal(externalGroup: ExternalGroup, previousGroup: ?Group, groupPrivateEncryptionKey: Uint8Array): InternalGroup {
  const { encryptedPrivateSignatureKey, ...groupBase } = externalGroup;
  const groupPrivateSignatureKey = tcrypto.sealDecrypt(encryptedPrivateSignatureKey, { publicKey: groupBase.lastPublicEncryptionKey, privateKey: groupPrivateEncryptionKey });

  const signatureKeyPairs = [];
  const encryptionKeyPairs = [];

  signatureKeyPairs.push({
    publicKey: groupBase.lastPublicSignatureKey,
    privateKey: groupPrivateSignatureKey,
  });

  encryptionKeyPairs.push({
    publicKey: groupBase.lastPublicEncryptionKey,
    privateKey: groupPrivateEncryptionKey,
  });

  return {
    ...groupBase,
    signatureKeyPairs,
    encryptionKeyPairs
  };
}

export function groupFromUserGroupEntry(
  entry: UserGroupEntry,
  previousGroup: ?Group,
  localUser: LocalUser,
  provisionalIdentityManager: ProvisionalIdentityManager
): Group {
  // Previous group already has every field we need
  if (previousGroup && isInternalGroup(previousGroup) && isGroupAddition(entry)) {
    return {
      ...previousGroup,
      lastGroupBlock: entry.hash,
    };
  }

  // Extract info from external group or UserGroupCreationEntry
  const groupId = previousGroup && previousGroup.groupId || entry.public_signature_key && entry.public_signature_key;
  const lastPublicSignatureKey = entry.public_signature_key || previousGroup && previousGroup.lastPublicSignatureKey;
  const lastPublicEncryptionKey = entry.public_encryption_key || previousGroup && previousGroup.lastPublicEncryptionKey;
  // $FlowIgnore[prop-missing] encryptedPrivateSignatureKey should exist
  const encryptedPrivateSignatureKey = entry.encrypted_group_private_signature_key || previousGroup && previousGroup.encryptedPrivateSignatureKey;

  if (!groupId || !lastPublicSignatureKey || !lastPublicEncryptionKey || !encryptedPrivateSignatureKey) {
    throw new InternalError('Assertion error: invalid group/entry combination');
  }

  // In case of group addition, get the lastGroupBlock from the previous group
  const lastGroupRotationBlock = previousGroup && isGroupAddition(entry) ? previousGroup.lastKeyRotationBlock : entry.hash;

  const externalGroup = {
    groupId,
    lastPublicSignatureKey,
    lastPublicEncryptionKey,
    lastGroupBlock: entry.hash,
    lastKeyRotationBlock: lastGroupRotationBlock,
    encryptedPrivateSignatureKey,
  };

  const groupPrivateEncryptionKey = findGroupPrivateEncryptionKey(entry, localUser, provisionalIdentityManager);

  // If found, return an internal group
  if (groupPrivateEncryptionKey) {
    return externalToInternal(externalGroup, previousGroup, groupPrivateEncryptionKey);
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

  // Refresh only once (i.e. a single API call), then loop to find the groups
  await provisionalIdentityManager.refreshProvisionalPrivateKeys();

  for (const entry of entries) {
    const b64groupId = utils.toBase64(entry.group_id ? entry.group_id : entry.public_signature_key);
    const previousData: GroupDataWithDevices = groupsMap.get(b64groupId) || [];
    const previousGroup = previousData.length ? previousData[previousData.length - 1].group : null;

    const group = groupFromUserGroupEntry(entry, previousGroup, localUser, provisionalIdentityManager);
    const devicePublicSignatureKey = devicePublicSignatureKeyMap.get(utils.toBase64(entry.author));
    if (!devicePublicSignatureKey) {
      throw new InternalError('author device publicSignatureKey missing');
    }
    previousData.push({ group, entry, devicePublicSignatureKey });

    groupsMap.set(b64groupId, previousData);
  }

  for (const groupData of groupsMap.values()) {
    // Get the last group
    const lastGroup = groupData[groupData.length - 1].group;

    if (!isInternalGroup(lastGroup)) {
      continue;
    }
    // There is only the last keypair in the array
    let currentEncryptionKeyPair: ?tcrypto.SodiumKeyPair = lastGroup.encryptionKeyPairs[0];

    if (!currentEncryptionKeyPair) {
      continue;
    }

    // Loop the entries backward and find the groupKeyPairs
    for (const data of groupData.slice().reverse()) {
      if (isGroupUpdate(data.entry)) {
        currentEncryptionKeyPair = decryptPreviousGroupKey(data.entry, currentEncryptionKeyPair);
        // Fill the list of encryption key
        lastGroup.encryptionKeyPairs.unshift(currentEncryptionKeyPair);
      }
    }
  }

  const groups: Array<Group> = [];
  for (const groupData of groupsMap.values()) {
    verifyGroup(groupData);
    groups.push(groupData[groupData.length - 1].group);
  }
  return groups;
}

/**
  Loop the block history backward. If the nature is:
    - user_group_creation_v1 or user_group_addition_v1: throw an error
    - user_group_creation_v2 or user_group_addition_v2 with provisional users: throw an error
    - user_group_addition: Add the users and provisional users in the arrays
    - user_group_creation or user_group_update: Add the users and provisional users in the arrays and stop the loop
*/
export function getUsersAndProvisionalUsersFromHistoryForUpdate(blocks: Array<b64string>) {
  const usersFromHistory: Array<GroupEncryptedKeyV2> = [];
  const provisionalUsersFromHistory: Array<ProvisionalGroupEncryptedKeyV3> = [];

  for (const block of blocks.reverse()) {
    const entry = getGroupEntryFromBlock(block);
    const usersFromEntry = entry.encrypted_group_private_encryption_keys_for_users;
    const provisionalUsersFromEntry = entry.encrypted_group_private_encryption_keys_for_provisional_users;
    const groupEntryVersion = getUserGroupEntryVersion(entry);
    if (groupEntryVersion === 1) {
      throw new UnsupportedGroupVersion("Can't remove members from a group V1");
    }
    if (groupEntryVersion === 2) {
      if (provisionalUsersFromEntry && provisionalUsersFromEntry.length !== 0) {
        throw new UnsupportedGroupVersion("Can't remove members from group V2 with provisional users");
      }
    }
    if (usersFromEntry) {
      // $FlowIgnore we checked that the userId exists
      usersFromHistory.push(...usersFromEntry);
    }

    if (provisionalUsersFromEntry) {
      // $FlowIgnore: we checked that the provisional users are ProvisionalGroupEncryptedKeyV3
      provisionalUsersFromHistory.push(...provisionalUsersFromEntry);
    }

    if (natureKind(entry.nature) === NATURE_KIND.user_group_creation || natureKind(entry.nature) === NATURE_KIND.user_group_update) {
      return { usersFromHistory, provisionalUsersFromHistory };
    }
  }

  throw new InternalError('Assertion error: user_group_creation or user_group_update not found in usergroup block history');
}
