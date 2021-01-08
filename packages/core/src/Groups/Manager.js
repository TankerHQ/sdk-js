// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidArgument, InternalError } from '@tanker/errors';
import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities } from '@tanker/identity';
import type { PublicProvisionalUser, PublicPermanentIdentity, PublicProvisionalIdentity } from '@tanker/identity';

import UserManager from '../Users/Manager';
import LocalUser from '../LocalUser/LocalUser';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';

import { getGroupEntryFromBlock, makeUserGroupCreation, makeUserGroupAdditionV3, makeUserGroupUpdate } from './Serialize';
import type { Client } from '../Network/Client';
import GroupStore from './GroupStore';
import { isInternalGroup, type InternalGroup, type Group } from './types';
import { type User } from '../Users/types';
import {
  assertExpectedGroups,
  assertPublicIdentities,
  groupsFromEntries,
  getUsersAndProvisionalUsersFromHistoryForUpdate,
  assertMembersToRemoveGroupUpdate,
} from './ManagerHelper';

export default class GroupManager {
  _localUser: LocalUser;
  _UserManager: UserManager;
  _provisionalIdentityManager: ProvisionalIdentityManager;
  _client: Client;
  _groupStore: GroupStore;

  constructor(
    client: Client,
    groupStore: GroupStore,
    localUser: LocalUser,
    userManager: UserManager,
    provisionalIdentityManager: ProvisionalIdentityManager,
  ) {
    this._localUser = localUser;
    this._UserManager = userManager;
    this._client = client;
    this._groupStore = groupStore;
    this._provisionalIdentityManager = provisionalIdentityManager;
  }

  async createGroup(publicIdentities: Array<b64string>): Promise<b64string> {
    assertPublicIdentities(publicIdentities);

    const deserializedIdentities = publicIdentities.map(i => _deserializePublicIdentity(i));
    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentities);
    const users = await this._UserManager.getUsersFromPublicIdentities(permanentIdentities, { isLight: true });
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);

    const groupEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();

    const { payload, nature } = makeUserGroupCreation(
      groupSignatureKeyPair,
      groupEncryptionKeyPair,
      users,
      provisionalUsers
    );

    const block = this._localUser.makeBlock(payload, nature);

    await this._client.createGroup({ user_group_creation: block });

    const groupId = groupSignatureKeyPair.publicKey;

    await this._groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupEncryptionKeyPair }]);

    return utils.toBase64(groupId);
  }

  async addGroupMembers(groupId: string, publicIdentities: Array<b64string>): Promise<void> {
    assertPublicIdentities(publicIdentities);

    const internalGroupId = utils.fromBase64(groupId);
    const existingGroup = await this._getInternalGroupById(internalGroupId);

    if (!existingGroup) {
      throw new InvalidArgument('groupId', 'string', groupId);
    }

    const deserializedIdentities = publicIdentities.map(i => _deserializePublicIdentity(i));
    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentities);
    const users = await this._UserManager.getUsersFromPublicIdentities(permanentIdentities, { isLight: true });
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);

    const { encryptionKeyPairs, lastGroupBlock, signatureKeyPairs } = existingGroup;

    const { payload, nature } = makeUserGroupAdditionV3(
      internalGroupId,
      signatureKeyPairs[signatureKeyPairs.length - 1].privateKey,
      lastGroupBlock,
      encryptionKeyPairs[encryptionKeyPairs.length - 1].privateKey,
      users,
      provisionalUsers,
    );

    const block = this._localUser.makeBlock(payload, nature);

    await this._client.patchGroup({ user_group_addition: block });
  }

  async updateGroupMembers(groupId: string, membersToAddPublicIdentities: Array<b64string>, memberToRemovePublicIdentities: Array<b64string>): Promise<void> {
    const internalGroupId = utils.fromBase64(groupId);
    const { group: existingGroup, blocks } = await this._getInternalGroupByIdWithGroupHistories(internalGroupId);

    if (!existingGroup) {
      throw new InvalidArgument('groupId', 'string', groupId);
    }

    // Members to add
    let usersToAdd: Array<User> = [];
    let provisionalUsersToAdd: Array<PublicProvisionalUser> = [];
    if (membersToAddPublicIdentities) {
      const membersToAddDeserializedIdentities = membersToAddPublicIdentities.map(i => _deserializePublicIdentity(i));
      const membersToAddIdentities = _splitProvisionalAndPermanentPublicIdentities(membersToAddDeserializedIdentities);
      const membersToAddPermanentIdentities = membersToAddIdentities.permanentIdentities;
      const membersToAddProvisionalIdentities = membersToAddIdentities.provisionalIdentities;
      usersToAdd = await this._UserManager.getUsersFromPublicIdentities(membersToAddPermanentIdentities);
      provisionalUsersToAdd = await this._provisionalIdentityManager.getProvisionalUsers(membersToAddProvisionalIdentities);
    }
    // Members to remove
    const membersToRemovePermanentIdentities: Array<{b64publicIdentity: b64string, publicPermanentIdentity: PublicPermanentIdentity}> = [];
    const membersToRemoveProvisionalIdentities: Array<{b64publicIdentity: b64string, publicProvisionalIdentity: PublicProvisionalIdentity}> = [];
    for (const memberToRemovePublicIdentity of memberToRemovePublicIdentities) {
      const membersToRemoveDeserializedIdentity = _deserializePublicIdentity(memberToRemovePublicIdentity);
      if (membersToRemoveDeserializedIdentity.target === 'user') {
        membersToRemovePermanentIdentities.push({
          b64publicIdentity: memberToRemovePublicIdentity, publicPermanentIdentity: (membersToRemoveDeserializedIdentity: PublicPermanentIdentity) });
      } else {
        membersToRemoveProvisionalIdentities.push({ b64publicIdentity: memberToRemovePublicIdentity, publicProvisionalIdentity: (membersToRemoveDeserializedIdentity: PublicProvisionalIdentity) });
      }
    }
    const provisionalUsersToRemove = await this._provisionalIdentityManager.getProvisionalUsers(membersToRemoveProvisionalIdentities.map(memberToRemove => memberToRemove.publicProvisionalIdentity));

    const membersToRemoveProvisionalUsers: Array<{b64publicIdentity: b64string, publicProvisionalUser: PublicProvisionalUser}> = [];
    for (const membersToRemoveProvisionalIdentity of membersToRemoveProvisionalIdentities) {
      const provisionalUserToRemove = provisionalUsersToRemove.find(provisionalUser => utils.toBase64(provisionalUser.appSignaturePublicKey) === membersToRemoveProvisionalIdentity.publicProvisionalIdentity.public_signature_key);
      if (!provisionalUserToRemove) {
        throw new InternalError('missing tanker provisional users in response');
      }
      membersToRemoveProvisionalUsers.push({ b64publicIdentity: membersToRemoveProvisionalIdentity.b64publicIdentity, publicProvisionalUser: provisionalUserToRemove });
    }

    const { usersFromHistory, provisionalUsersFromHistory } = getUsersAndProvisionalUsersFromHistoryForUpdate(blocks);

    const usersInGroup = await this._UserManager.getUsersFromUserIds(usersFromHistory.map(user => user.user_id));

    assertMembersToRemoveGroupUpdate(usersInGroup, provisionalUsersFromHistory, membersToRemovePermanentIdentities, membersToRemoveProvisionalUsers, usersToAdd, provisionalUsersToAdd);

    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const signatureKeyPair = tcrypto.makeSignKeyPair();

    const { encryptionKeyPairs, lastGroupBlock, lastKeyRotationBlock, signatureKeyPairs } = existingGroup;

    const { payload, nature } = makeUserGroupUpdate(
      internalGroupId,
      signatureKeyPair,
      encryptionKeyPair,
      lastGroupBlock,
      lastKeyRotationBlock,
      signatureKeyPairs[signatureKeyPairs.length - 1].privateKey,
      encryptionKeyPairs[encryptionKeyPairs.length - 1].privateKey,
      usersInGroup,
      provisionalUsersFromHistory,
      usersToAdd,
      provisionalUsersToAdd,
      membersToRemovePermanentIdentities.map(memberToRemove => memberToRemove.publicPermanentIdentity),
      membersToRemoveProvisionalIdentities.map(memberToRemove => memberToRemove.publicProvisionalIdentity),
    );

    const block = this._localUser.makeBlock(payload, nature);

    await this._client.putGroup({ user_group_update: block });

    await this._groupStore.saveGroupEncryptionKeys([{ groupId: internalGroupId, encryptionKeyPair }]);
  }

  async getGroupsPublicEncryptionKeys(groupIds: Array<Uint8Array>): Promise<Array<Uint8Array>> {
    if (groupIds.length === 0) return [];

    const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds(groupIds, { isLight: true });
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroups(groups, groupIds);

    const encryptionKeysRecord = [];
    groups.forEach(group => {
      if (isInternalGroup(group)) {
        group.encryptionKeyPairs.forEach(encryptionKeyPair => {
          encryptionKeysRecord.push({ groupId: group.groupId, encryptionKeyPair });
        });
      }
    });

    await this._groupStore.saveGroupEncryptionKeys(encryptionKeysRecord);

    return groups.map(group => group.lastPublicEncryptionKey);
  }

  async getGroupEncryptionKeyPair(groupPublicEncryptionKey: Uint8Array) {
    const cachedEncryptionKeyPair = await this._groupStore.findGroupEncryptionKeyPair(groupPublicEncryptionKey);
    if (cachedEncryptionKeyPair) {
      return cachedEncryptionKeyPair;
    }

    const { histories: blocks } = await this._client.getGroupHistoriesByGroupPublicEncryptionKey(groupPublicEncryptionKey, { isLight: true });
    const groups = await this._groupsFromBlocks(blocks);

    let result;
    const encryptionKeyPairRecords = [];
    for (const group of groups) {
      if (isInternalGroup(group)) {
        for (const encryptionKeyPair of group.encryptionKeyPairs) {
          encryptionKeyPairRecords.push({ groupId: group.groupId, encryptionKeyPair });
          if (utils.equalArray(groupPublicEncryptionKey, encryptionKeyPair.publicKey)) {
            result = encryptionKeyPair;
          }
        }
      }
    }

    await this._groupStore.saveGroupEncryptionKeys(encryptionKeyPairRecords);

    if (!result) {
      throw new InvalidArgument('Current user is not a group member');
    }

    return result;
  }

  async _getInternalGroupById(groupId: Uint8Array): Promise<InternalGroup> {
    const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds([groupId], { isLight: true });
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroups(groups, [groupId]);

    const group = groups[0];
    if (!isInternalGroup(group)) {
      throw new InvalidArgument('Current user is not a group member');
    }

    return group;
  }

  async _getInternalGroupByIdWithGroupHistories(groupId: Uint8Array) {
    const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds([groupId], { isLight: false });
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroups(groups, [groupId]);

    const group = groups[0];
    if (!isInternalGroup(group)) {
      throw new InvalidArgument('Current user is not a group member');
    }

    return { group, blocks };
  }

  async _groupsFromBlocks(blocks: Array<b64string>): Promise<Array<Group>> {
    if (blocks.length === 0) {
      return [];
    }

    const entries = blocks.map(block => getGroupEntryFromBlock(block));

    const deviceIds = entries.map(entry => entry.author);
    const devicePublicSignatureKeyMap = await this._UserManager.getDeviceKeysByDevicesIds(deviceIds, { isLight: true });

    return groupsFromEntries(entries, devicePublicSignatureKeyMap, this._localUser, this._provisionalIdentityManager);
  }
}
