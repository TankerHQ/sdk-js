// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';

import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities } from '../Identity';
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

type CachedPublicKeysResult = {
  cachedKeys: Array<Uint8Array>,
  missingGroupIds: Array<Uint8Array>,
};

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

    await this._groupStore.saveGroupEncryptionKeys([{
      groupId,
      publicEncryptionKey: groupEncryptionKeyPair.publicKey,
      privateEncryptionKey: groupEncryptionKeyPair.privateKey,
    }]);

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

    const { cachedKeys, missingGroupIds } = await this._getCachedGroupsPublicKeys(groupIds);
    const newKeys = [];

    if (missingGroupIds.length > 0) {
      const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds(missingGroupIds);
      const groups = await this._groupsFromBlocks(blocks);
      assertExpectedGroups(groups, missingGroupIds);

      const externalGroupRecords = [];
      const internalGroupRecords = [];
      for (const group of groups) {
        if (isInternalGroup(group)) {
          for (const encryptionKeyPair of group.encryptionKeyPairs) {
            internalGroupRecords.push({ groupId: group.groupId,
              publicEncryptionKey: encryptionKeyPair.publicKey,
              privateEncryptionKey: encryptionKeyPair.privateKey,
            });
          }
        } else {
          externalGroupRecords.push({
            groupId: group.groupId,
            publicEncryptionKey: group.lastPublicEncryptionKey,
          });
        }
        newKeys.push(group.lastPublicEncryptionKey);
      }

      await this._groupStore.saveGroupPublicEncryptionKeys(externalGroupRecords);
      await this._groupStore.saveGroupEncryptionKeys(internalGroupRecords);
    }

    return cachedKeys.concat(newKeys);
  }

  async getGroupEncryptionKeyPair(groupPublicEncryptionKey: Uint8Array) {
    const cachedEncryptionKeyPair = await this._groupStore.findGroupEncryptionKeyPair(groupPublicEncryptionKey);
    if (cachedEncryptionKeyPair) {
      return cachedEncryptionKeyPair;
    }

    const { histories: blocks } = await this._client.getGroupHistoriesByGroupPublicEncryptionKey(groupPublicEncryptionKey);
    const groups = await this._groupsFromBlocks(blocks);

    let result;
    const internalGroupRecords = [];
    for (const group of groups) {
      if (isInternalGroup(group)) {
        for (const encryptionKeyPair of group.encryptionKeyPairs) {
          internalGroupRecords.push({ groupId: group.groupId,
            publicEncryptionKey: encryptionKeyPair.publicKey,
            privateEncryptionKey: encryptionKeyPair.privateKey,
          });
          if (utils.equalArray(groupPublicEncryptionKey, encryptionKeyPair.publicKey)) {
            result = encryptionKeyPair;
          }
        }
      }
    }

    await this._groupStore.saveGroupEncryptionKeys(internalGroupRecords);

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

  async _getCachedGroupsPublicKeys(groupsIds: Array<Uint8Array>): Promise<CachedPublicKeysResult> {
    const cachePublicKeys = await this._groupStore.findGroupsPublicKeys(groupsIds);
    const missingGroupIds = [];

    const isGroupInCache = {};
    for (const groupId of groupsIds) {
      isGroupInCache[utils.toBase64(groupId)] = false;
    }

    for (const group of cachePublicKeys) {
      isGroupInCache[utils.toBase64(group.groupId)] = true;
    }

    for (const groupId of Object.keys(isGroupInCache)) {
      if (!isGroupInCache[groupId]) {
        missingGroupIds.push(utils.fromBase64(groupId));
      }
    }

    return {
      cachedKeys: cachePublicKeys.map(r => r.publicEncryptionKey),
      missingGroupIds,
    };
  }
}
