// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities } from '@tanker/identity';

import UserManager from '../Users/Manager';
import LocalUser from '../LocalUser/LocalUser';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';

import { getGroupEntryFromBlock, makeUserGroupCreation, makeUserGroupAdditionV3 } from './Serialize';
import type { Client } from '../Network/Client';
import GroupStore from './GroupStore';
import { isInternalGroup, type InternalGroup, type Group } from './types';
import {
  assertExpectedGroups,
  assertPublicIdentities,
  groupsFromEntries,
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
    const users = await this._UserManager.getUsers(permanentIdentities, { isLight: true });
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

  async updateGroupMembers(groupId: string, publicIdentities: Array<b64string>): Promise<void> {
    assertPublicIdentities(publicIdentities);

    const internalGroupId = utils.fromBase64(groupId);
    const existingGroup = await this._getInternalGroupById(internalGroupId);

    if (!existingGroup) {
      throw new InvalidArgument('groupId', 'string', groupId);
    }

    const deserializedIdentities = publicIdentities.map(i => _deserializePublicIdentity(i));
    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentities);
    const users = await this._UserManager.getUsers(permanentIdentities, { isLight: true });
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

  async getGroupsPublicEncryptionKeys(groupIds: Array<Uint8Array>): Promise<Array<Uint8Array>> {
    if (groupIds.length === 0) return [];

    const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds(groupIds);
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

    const { histories: blocks } = await this._client.getGroupHistoriesByGroupPublicEncryptionKey(groupPublicEncryptionKey);
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
    const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds([groupId]);
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroups(groups, [groupId]);

    const group = groups[0];
    if (!isInternalGroup(group)) {
      throw new InvalidArgument('Current user is not a group member');
    }

    return group;
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
