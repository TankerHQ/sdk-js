// @flow
import find from 'array-find';
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities } from '@tanker/identity';

import UserManager from '../Users/Manager';
import LocalUser from '../Session/LocalUser/LocalUser';
import ProvisionalIdentityManager from '../Session/ProvisionalIdentity/ProvisionalIdentityManager';

import { getGroupEntryFromBlock } from './Serialize';
import { Client, b64RequestObject } from '../Network/Client';
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
}

export default class GroupManager {
  _localUser: LocalUser
  _UserManager: UserManager;
  _provisionalIdentityManager: ProvisionalIdentityManager;
  _client: Client;
  _groupStore: GroupStore;

  constructor(
    localUser: LocalUser,
    groupStore: GroupStore,
    userManager: UserManager,
    provisionalIdentityManager: ProvisionalIdentityManager,
    client: Client
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
    const users = await this._UserManager.getUsers({ publicIdentities: permanentIdentities });
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);

    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();

    const userGroupCreationBlock = this._localUser.blockGenerator.createUserGroup(
      groupSignatureKeyPair,
      tcrypto.makeEncryptionKeyPair(),
      users,
      provisionalUsers
    );

    await this._client.sendBlock(userGroupCreationBlock);

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
    const users = await this._UserManager.getUsers({ publicIdentities: permanentIdentities });
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);

    const userGroupAdditionBlock = this._localUser.blockGenerator.addToUserGroup(
      internalGroupId,
      existingGroup.signatureKeyPair.privateKey,
      existingGroup.lastGroupBlock,
      existingGroup.encryptionKeyPair.privateKey,
      users,
      provisionalUsers,
    );

    await this._client.sendBlock(userGroupAdditionBlock);
  }

  async getGroupsPublicEncryptionKeys(groupIds: Array<Uint8Array>): Promise<Array<Uint8Array>> {
    if (groupIds.length === 0) return [];

    const { cachedKeys, missingGroupIds } = await this._getCachedGroupsPublicKeys(groupIds);
    const newKeys = [];

    if (missingGroupIds.length > 0) {
      const blocks = await this._getGroupsBlocksById(missingGroupIds);
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

    const blocks = await this._getGroupBlocksByPublicKey(groupPublicEncryptionKey);
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
    const blocks = await this._getGroupsBlocksById([groupId]);
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroups(groups, [groupId]);

    const group = groups[0];
    if (!group.encryptionKeyPair) {
      throw new InvalidArgument('Current user is not a group member');
    }

    return group;
  }

  async _groupsFromBlocks(blocks: Array<b64string>): Promise<Array<Group>> {
    const entries = blocks.map(block => getGroupEntryFromBlock(block));

    const deviceIds = entries.map(entry => entry.author);
    const devicePublicSignatureKeyMap = await this._UserManager.getDeviceKeysByDevicesIds(deviceIds);

    return groupsFromEntries(entries, devicePublicSignatureKeyMap, this._localUser, this._provisionalIdentityManager);
  }

  _getGroupBlocksByPublicKey(groupPublicEncryptionKey: Uint8Array) {
    const request = {
      group_public_key: groupPublicEncryptionKey,
    };

    return this._client.send('get groups blocks', b64RequestObject(request));
  }

  _getGroupsBlocksById(groupsIds: Array<Uint8Array>) {
    const request = {
      groups_ids: groupsIds,
    };

    return this._client.send('get groups blocks', b64RequestObject(request));
  }

  async _getCachedGroupsPublicKeys(groupsIds: Array<Uint8Array>): Promise<CachedPublicKeysResult> {
    const cacheResults = await this._groupStore.findGroupsPublicKeys(groupsIds);
    const missingGroupIds = [];

    groupsIds.forEach(groupId => {
      const resultFromCache = find(cacheResults, result => utils.equalArray(result.groupId, groupId));
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
