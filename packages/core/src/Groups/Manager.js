// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities } from '@tanker/identity';

import UserManager from '../Users/Manager';
import LocalUser from '../LocalUser/LocalUser';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';

import { getGroupEntryFromBlock, makeUserGroupCreation, makeUserGroupAdditionV2, makeUserGroupAdditionV3 } from './Serialize';
import type { Client } from '../Network/Client';
import GroupStore from './GroupStore';
import type { InternalGroup, Group } from './types';
import {
  assertExpectedGroups,
  assertExpectedGroupsByPublicKey,
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
    const users = await this._UserManager.getUsers(permanentIdentities);
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);

    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();

    const { payload, nature } = makeUserGroupCreation(
      groupSignatureKeyPair,
      tcrypto.makeEncryptionKeyPair(),
      users,
      provisionalUsers
    );

    const block = this._localUser.makeBlock(payload, nature);

    await this._client.createGroup({ user_group_creation: block });

    return utils.toBase64(groupSignatureKeyPair.publicKey);
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
    const users = await this._UserManager.getUsers(permanentIdentities);
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);

    const makeUserGroupAddition = existingGroup.groupVersion === 3 ? makeUserGroupAdditionV3 : makeUserGroupAdditionV2;

    const { payload, nature } = makeUserGroupAddition(
      internalGroupId,
      existingGroup.signatureKeyPair.privateKey,
      existingGroup.lastGroupBlock,
      existingGroup.encryptionKeyPair.privateKey,
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

      const records = [];
      for (const group of groups) {
        const { groupId, publicEncryptionKey } = group;
        records.push({ groupId, publicEncryptionKey });
        newKeys.push(publicEncryptionKey);
      }

      await this._groupStore.saveGroupsPublicKeys(records);
    }

    return cachedKeys.concat(newKeys);
  }

  async getGroupEncryptionKeyPair(groupPublicEncryptionKey: Uint8Array) {
    const cachedEncryptionKeyPair = await this._groupStore.findGroupKeyPair(groupPublicEncryptionKey);
    if (cachedEncryptionKeyPair) {
      return cachedEncryptionKeyPair;
    }

    const { histories: blocks } = await this._client.getGroupHistoriesByGroupPublicEncryptionKey(groupPublicEncryptionKey);
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroupsByPublicKey(groups, groupPublicEncryptionKey);

    const group = groups[0];
    if (!group.encryptionKeyPair) {
      throw new InvalidArgument('Current user is not a group member');
    }

    await this._groupStore.saveGroupKeyPair(group.groupId, group.encryptionKeyPair);
    return group.encryptionKeyPair;
  }

  async _getInternalGroupById(groupId: Uint8Array): Promise<InternalGroup> {
    const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds([groupId]);
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroups(groups, [groupId]);

    const group = groups[0];
    if (!group.encryptionKeyPair) {
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
    const devicePublicSignatureKeyMap = await this._UserManager.getDeviceKeysByDevicesIds(deviceIds);

    return groupsFromEntries(entries, devicePublicSignatureKeyMap, this._localUser, this._provisionalIdentityManager);
  }

  async _getCachedGroupsPublicKeys(groupsIds: Array<Uint8Array>): Promise<CachedPublicKeysResult> {
    const cacheResults = await this._groupStore.findGroupsPublicKeys(groupsIds);
    const missingGroupIds = [];

    groupsIds.forEach(groupId => {
      const resultFromCache = cacheResults.find(result => utils.equalArray(result.groupId, groupId));
      if (!resultFromCache) {
        missingGroupIds.push(groupId);
      }
    });
    return {
      cachedKeys: cacheResults.map(res => res.publicEncryptionKey),
      missingGroupIds,
    };
  }
}
