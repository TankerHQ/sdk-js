import type { b64string } from '@tanker/crypto';
import { tcrypto, utils } from '@tanker/crypto';
import { GroupTooBig, InvalidArgument, InternalError } from '@tanker/errors';

import type { GroupEncryptedKey, ProvisionalGroupEncryptedKeyV2, ProvisionalGroupEncryptedKeyV3, UserGroupEntry } from './Serialize';
import { isGroupAddition } from './Serialize';
import type { Group, ExternalGroup, InternalGroup } from './types';
import { isInternalGroup } from './types';
import { verifyGroupAction } from './Verify';

import type ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';
import type LocalUser from '../LocalUser/LocalUser';
import type { PrivateProvisionalKeys } from '../LocalUser/Manager';

export const MAX_GROUP_MEMBERS_PER_OPERATION = 1000;

export type GroupData = Array<{
  entry: UserGroupEntry;
  group: Group;
}>;

export type GroupDataWithDevices = Array<{
  entry: UserGroupEntry;
  group: Group;
  devicePublicSignatureKey: Uint8Array;
}>;

export function assertPublicIdentities(publicIdentities: Array<b64string>) {
  if (publicIdentities.length > MAX_GROUP_MEMBERS_PER_OPERATION)
    throw new GroupTooBig(`You cannot add more than ${MAX_GROUP_MEMBERS_PER_OPERATION} members at once to a group`);
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

function findMyUserKeys(groupKeys: ReadonlyArray<GroupEncryptedKey>, localUser: LocalUser): { userKeyPair: tcrypto.SodiumKeyPair; groupEncryptedKey: Uint8Array; } | null {
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

function findMyProvisionalKeys(groupKeys: ReadonlyArray<ProvisionalGroupEncryptedKeyV2 | ProvisionalGroupEncryptedKeyV3>, provisionalIdentityManager: ProvisionalIdentityManager): { provisionalKeyPair: PrivateProvisionalKeys; groupEncryptedKey: Uint8Array; } | null {
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

function provisionalUnseal(ciphertext: Uint8Array, keys: PrivateProvisionalKeys): Uint8Array {
  const intermediate = tcrypto.sealDecrypt(ciphertext, keys.tankerEncryptionKeyPair);
  return tcrypto.sealDecrypt(intermediate, keys.appEncryptionKeyPair);
}

function findGroupPrivateEncryptionKey(entry: UserGroupEntry, localUser: LocalUser, provisionalIdentityManager: ProvisionalIdentityManager): Uint8Array | null {
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

  return null;
}

function externalToInternal(externalGroup: ExternalGroup, previousGroup: Group | null, groupPrivateEncryptionKey: Uint8Array): InternalGroup {
  const { encryptedPrivateSignatureKey, ...groupBase } = externalGroup;
  const groupPrivateSignatureKey = tcrypto.sealDecrypt(encryptedPrivateSignatureKey, { publicKey: groupBase.lastPublicEncryptionKey, privateKey: groupPrivateEncryptionKey });

  const signatureKeyPairs = [];
  const encryptionKeyPairs = [];

  if (previousGroup && isInternalGroup(previousGroup)) {
    signatureKeyPairs.push(...previousGroup.signatureKeyPairs);
    encryptionKeyPairs.push(...previousGroup.encryptionKeyPairs);
  }

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
    encryptionKeyPairs,
  };
}

export function groupFromUserGroupEntry(
  entry: UserGroupEntry,
  previousGroup: Group | null,
  localUser: LocalUser,
  provisionalIdentityManager: ProvisionalIdentityManager,
): Group {
  // Previous group already has every field we need
  if (previousGroup && isInternalGroup(previousGroup) && (
    isGroupAddition(entry)
    || utils.equalArray(previousGroup.lastPublicEncryptionKey, entry.public_encryption_key))
  ) {
    return {
      ...previousGroup,
      lastGroupBlock: entry.hash,
    };
  }

  // Extract info from external group or UserGroupCreationEntry
  let groupId: Uint8Array | undefined;
  let lastPublicSignatureKey: Uint8Array | undefined;
  let lastPublicEncryptionKey: Uint8Array | undefined;
  let encryptedPrivateSignatureKey: Uint8Array | undefined;

  if (previousGroup) {
    groupId = previousGroup.groupId;
    lastPublicSignatureKey = previousGroup.lastPublicSignatureKey;
    lastPublicEncryptionKey = previousGroup.lastPublicEncryptionKey;
    if (!isInternalGroup(previousGroup)) {
      encryptedPrivateSignatureKey = previousGroup.encryptedPrivateSignatureKey;
    }
  }

  if (!isGroupAddition(entry)) {
    groupId = groupId || entry.public_signature_key;
    lastPublicSignatureKey = entry.public_signature_key;
    lastPublicEncryptionKey = entry.public_encryption_key;
    encryptedPrivateSignatureKey = entry.encrypted_group_private_signature_key;
  }

  if (!groupId || !lastPublicSignatureKey || !lastPublicEncryptionKey || !encryptedPrivateSignatureKey) {
    throw new InternalError('Assertion error: invalid group/entry combination');
  }

  const externalGroup = {
    groupId,
    lastPublicSignatureKey,
    lastPublicEncryptionKey,
    lastGroupBlock: entry.hash,
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
  let previousGroup: Group | null = null;
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
    let b64groupId: string;
    if ('group_id' in entry) {
      b64groupId = utils.toBase64(entry.group_id);
    } else {
      b64groupId = utils.toBase64(entry.public_signature_key);
    }

    const previousData: GroupDataWithDevices = groupsMap.get(b64groupId) || [];
    const previousGroup = previousData.length ? previousData[previousData.length - 1]!.group : null;

    const group = groupFromUserGroupEntry(entry, previousGroup, localUser, provisionalIdentityManager);
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
    groups.push(groupData[groupData.length - 1]!.group);
  }

  return groups;
}
