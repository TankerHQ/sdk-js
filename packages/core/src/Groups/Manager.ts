import type { b64string } from '@tanker/crypto';
import { tcrypto, utils } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';

import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities, _serializeIdentity, assertTrustchainId } from '../Identity';
import { TaskCoalescer } from '../TaskCoalescer';
import type { PublicPermanentIdentity, PublicProvisionalIdentity } from '../Identity';
import type UserManager from '../Users/Manager';
import type LocalUser from '../LocalUser/LocalUser';
import type ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';

import { getGroupEntryFromBlock, makeUserGroupCreation, makeUserGroupAdditionV3, makeUserGroupRemoval } from './Serialize';
import type { Client } from '../Network/Client';
import type { GroupStore } from './GroupStore';
import type { InternalGroup, Group } from './types';
import { isInternalGroup } from './types';
import { assertExpectedGroups, assertPublicIdentities, groupsFromEntries } from './ManagerHelper';

type GroupPublicKeyRecord = {
  id: b64string;
  key: Uint8Array;
};

type CachedPublicKeysResult = {
  cachedKeys: Array<GroupPublicKeyRecord>;
  missingGroupIds: Array<Uint8Array>;
};

function checkAddedAndRemoved(permanentIdentitiesToAdd: Array<PublicPermanentIdentity>, permanentIdentitiesToRemove: Array<PublicPermanentIdentity>, provisionalIdentitiesToAdd: Array<PublicProvisionalIdentity>, provisionalIdentitiesToRemove: Array<PublicProvisionalIdentity>) {
  const addedAndRemovedIdentities: Array<b64string> = [];
  const userIdsToAdd: Set<b64string> = new Set();
  const appSignaturePublicKeysToAdd: Set<b64string> = new Set();

  for (const i of permanentIdentitiesToAdd)
    userIdsToAdd.add(i.value);

  for (const i of provisionalIdentitiesToAdd)
    appSignaturePublicKeysToAdd.add(i.public_signature_key);

  for (const i of permanentIdentitiesToRemove)
    if (userIdsToAdd.has(i.value))
      // @ts-expect-error this field is hidden
      addedAndRemovedIdentities.push(i.serializedIdentity || _serializeIdentity(i));

  for (const i of provisionalIdentitiesToRemove)
    if (appSignaturePublicKeysToAdd.has(i.public_signature_key))
      // @ts-expect-error this field is hidden
      addedAndRemovedIdentities.push(i.serializedIdentity || _serializeIdentity(i));

  if (addedAndRemovedIdentities.length)
    throw new InvalidArgument(`The identities ${addedAndRemovedIdentities.join(', ')} are both added to and removed from the group.`);
}

type GroupEncryptionKeyPairRecord = {
  id: b64string;
  keys: tcrypto.SodiumKeyPair;
};

export default class GroupManager {
  _localUser: LocalUser;
  _UserManager: UserManager;
  _provisionalIdentityManager: ProvisionalIdentityManager;
  _client: Client;
  _groupStore: GroupStore;
  _encryptionKeyPairLookupCoalescer: TaskCoalescer<GroupEncryptionKeyPairRecord>;
  _publicEncryptionKeyLookupCoalescer: TaskCoalescer<GroupPublicKeyRecord>;

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
    this._encryptionKeyPairLookupCoalescer = new TaskCoalescer();
    this._publicEncryptionKeyLookupCoalescer = new TaskCoalescer();
  }

  async createGroup(publicIdentities: Array<b64string>): Promise<b64string> {
    assertPublicIdentities(publicIdentities);

    const deserializedIdentities = publicIdentities.map(i => _deserializePublicIdentity(i));
    assertTrustchainId(deserializedIdentities, this._localUser.trustchainId);

    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentities);
    const users = await this._UserManager.getUsers(permanentIdentities, { isLight: true });
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);
    const groupEncryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();

    const { payload, nature } = makeUserGroupCreation(
      groupSignatureKeyPair,
      groupEncryptionKeyPair,
      users,
      provisionalUsers,
    );

    const block = this._localUser.makeBlock(payload, nature);

    await this._client.createGroup({ user_group_creation: block });

    const groupId = groupSignatureKeyPair.publicKey;

    // Only save the key if we are in the group
    const myUserId = utils.toBase64(this._localUser.userId);
    if (permanentIdentities.find(i => i.value === myUserId))
      await this._groupStore.saveGroupEncryptionKeys([{
        groupId: utils.toBase64(groupId),
        publicEncryptionKey: groupEncryptionKeyPair.publicKey,
        privateEncryptionKey: groupEncryptionKeyPair.privateKey,
      }]);

    return utils.toBase64(groupId);
  }

  async updateGroupMembers(groupId: string, publicIdentitiesToAdd: Array<b64string>, publicIdentitiesToRemove: Array<b64string>): Promise<void> {
    assertPublicIdentities(publicIdentitiesToAdd);
    assertPublicIdentities(publicIdentitiesToRemove);

    const internalGroupId = utils.fromBase64(groupId);
    const existingGroup = await this._getInternalGroupById(internalGroupId);

    if (!existingGroup) {
      throw new InvalidArgument('groupId', 'string', groupId);
    }

    const { encryptionKeyPairs, lastGroupBlock, signatureKeyPairs } = existingGroup;

    const deserializedIdentitiesToAdd = publicIdentitiesToAdd.map(i => _deserializePublicIdentity(i));
    assertTrustchainId(deserializedIdentitiesToAdd, this._localUser.trustchainId);
    const { permanentIdentities: permanentIdentitiesToAdd, provisionalIdentities: provisionalIdentitiesToAdd } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentitiesToAdd);

    const deserializedIdentitiesToRemove = publicIdentitiesToRemove.map(i => _deserializePublicIdentity(i));
    assertTrustchainId(deserializedIdentitiesToRemove, this._localUser.trustchainId);
    const { permanentIdentities: permanentIdentitiesToRemove, provisionalIdentities: provisionalIdentitiesToRemove } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentitiesToRemove);

    checkAddedAndRemoved(permanentIdentitiesToAdd, permanentIdentitiesToRemove, provisionalIdentitiesToAdd, provisionalIdentitiesToRemove);

    const usersToAdd = await this._UserManager.getUsers(permanentIdentitiesToAdd, { isLight: true });
    const provisionalUsersToAdd = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentitiesToAdd);
    const usersToRemove = [...new Set(permanentIdentitiesToRemove.map(u => u.value))].map(uid => utils.fromBase64(uid));
    const provisionalUsersToRemove = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentitiesToRemove);

    let additionBlock;
    let removalBlock;

    if (publicIdentitiesToAdd.length) {
      const { payload, nature } = makeUserGroupAdditionV3(
        internalGroupId,
        signatureKeyPairs[signatureKeyPairs.length - 1]!.privateKey,
        lastGroupBlock, encryptionKeyPairs[encryptionKeyPairs.length - 1]!.privateKey,
        usersToAdd,
        provisionalUsersToAdd,
      );

      additionBlock = this._localUser.makeBlock(payload, nature);
    }
    if (publicIdentitiesToRemove.length) {
      const { payload, nature } = makeUserGroupRemoval(
        this._localUser.deviceId,
        internalGroupId,
        signatureKeyPairs[signatureKeyPairs.length - 1]!.privateKey,
        usersToRemove,
        provisionalUsersToRemove,
      );

      removalBlock = this._localUser.makeBlock(payload, nature);
    }

    if (removalBlock)
      await this._client.softUpdateGroup({ user_group_addition: additionBlock, user_group_removal: removalBlock });
    else
      await this._client.patchGroup({ user_group_addition: additionBlock });
  }

  async getGroupsPublicEncryptionKeys(groupIds: Array<b64string>): Promise<Array<Uint8Array>> {
    const result = await this._publicEncryptionKeyLookupCoalescer.run(this._getGroupsPublicEncryptionKeys, groupIds);

    return result.map(record => record.key);
  }

  _getGroupsPublicEncryptionKeys = async (groupIds: Array<b64string>): Promise<Array<GroupPublicKeyRecord>> => {
    const {
      cachedKeys,
      missingGroupIds,
    } = await this._getCachedGroupsPublicKeys(groupIds);

    if (missingGroupIds.length === 0) {
      return cachedKeys;
    }

    const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds(missingGroupIds);
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroups(groups, missingGroupIds);

    const newKeys = [];
    const externalGroupRecords = [];
    const internalGroupRecords = [];
    for (const group of groups) {
      const groupId = utils.toBase64(group.groupId);
      if (isInternalGroup(group)) {
        for (const encryptionKeyPair of group.encryptionKeyPairs) {
          internalGroupRecords.push({
            groupId,
            publicEncryptionKey: encryptionKeyPair.publicKey,
            privateEncryptionKey: encryptionKeyPair.privateKey,
          });
        }
      } else {
        externalGroupRecords.push({
          groupId,
          publicEncryptionKey: group.lastPublicEncryptionKey,
        });
      }

      newKeys.push({ id: groupId, key: group.lastPublicEncryptionKey });
    }

    await this._groupStore.saveGroupPublicEncryptionKeys(externalGroupRecords);
    await this._groupStore.saveGroupEncryptionKeys(internalGroupRecords);

    return cachedKeys.concat(newKeys);
  };

  async getGroupEncryptionKeyPair(groupPublicEncryptionKey: Uint8Array) {
    const b64GroupPublicEncryptionKey = utils.toBase64(groupPublicEncryptionKey);

    const result = await this._encryptionKeyPairLookupCoalescer.run(this._getGroupEncryptionKeyPairs, [b64GroupPublicEncryptionKey]);
    return result[0]!.keys;
  }

  _getGroupEncryptionKeyPairs = (b64GroupPublicEncryptionKeys: Array<b64string>): Promise<Array<GroupEncryptionKeyPairRecord>> => {
    const promises = b64GroupPublicEncryptionKeys.map(async (b64GroupPublicEncryptionKey) => {
      const cachedEncryptionKeyPair = await this._groupStore.findGroupEncryptionKeyPair(b64GroupPublicEncryptionKey);

      if (cachedEncryptionKeyPair) {
        return { id: b64GroupPublicEncryptionKey, keys: cachedEncryptionKeyPair };
      }

      const groupPublicEncryptionKey = utils.fromBase64(b64GroupPublicEncryptionKey);
      const { histories: blocks } = await this._client.getGroupHistoriesByGroupPublicEncryptionKey(groupPublicEncryptionKey);
      const groups = await this._groupsFromBlocks(blocks);

      let result;
      const internalGroupRecords = [];
      for (const group of groups) {
        if (isInternalGroup(group)) {
          for (const encryptionKeyPair of group.encryptionKeyPairs) {
            internalGroupRecords.push({
              groupId: utils.toBase64(group.groupId),
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

      return { id: b64GroupPublicEncryptionKey, keys: result };
    });
    return Promise.all(promises);
  };

  async _getInternalGroupById(groupId: Uint8Array): Promise<InternalGroup> {
    const { histories: blocks } = await this._client.getGroupHistoriesByGroupIds([groupId]);
    const groups = await this._groupsFromBlocks(blocks);
    assertExpectedGroups(groups, [groupId]);

    const group = groups[0]!;
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

  async _getCachedGroupsPublicKeys(groupsIds: Array<b64string>): Promise<CachedPublicKeysResult> {
    const cachePublicKeys = await this._groupStore.findGroupsPublicKeys(groupsIds);
    const missingGroupIds = [];

    const isGroupInCache: Record<b64string, boolean> = {};
    for (const groupId of groupsIds) {
      isGroupInCache[groupId] = false;
    }

    for (const group of cachePublicKeys) {
      isGroupInCache[group.groupId] = true;
    }

    for (const groupId of Object.keys(isGroupInCache)) {
      if (!isGroupInCache[groupId]) {
        missingGroupIds.push(utils.fromBase64(groupId));
      }
    }

    return {
      cachedKeys: cachePublicKeys.map(r => ({ id: r.groupId, key: r.publicEncryptionKey })),
      missingGroupIds,
    };
  }
}
