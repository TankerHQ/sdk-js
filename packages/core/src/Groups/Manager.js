// @flow

import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities } from '@tanker/identity';

import UserAccessor from '../Users/UserAccessor';
import LocalUser from '../Session/LocalUser';
import { Client } from '../Network/Client';
import GroupStore from './GroupStore';
import { type ExternalGroup } from './types';
import Trustchain from '../Trustchain/Trustchain';
import { InvalidArgument, GroupTooBig } from '../errors';

export const MAX_GROUP_SIZE = 1000;

export default class GroupManager {
  _localUser: LocalUser
  _trustchain: Trustchain;
  _groupStore: GroupStore;
  _userAccessor: UserAccessor;
  _client: Client;

  constructor(
    localUser: LocalUser,
    trustchain: Trustchain,
    groupStore: GroupStore,
    userAccessor: UserAccessor,
    client: Client
  ) {
    this._localUser = localUser;
    this._trustchain = trustchain;
    this._groupStore = groupStore;
    this._userAccessor = userAccessor;
    this._client = client;
  }

  async createGroup(publicIdentities: Array<b64string>): Promise<b64string> {
    if (publicIdentities.length === 0)
      throw new InvalidArgument('A group cannot be created empty');
    if (publicIdentities.length > MAX_GROUP_SIZE)
      throw new GroupTooBig(`A group cannot have more than ${MAX_GROUP_SIZE} members`);

    const deserializedIdentities = publicIdentities.map(i => _deserializePublicIdentity(i));
    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentities);
    const users = await this._userAccessor.getUsers({ publicIdentities: permanentIdentities });
    const provisionalUsers = await this._client.getProvisionalUsers(provisionalIdentities);

    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();

    // no need to keep the keys, we will get them when we receive the group block
    const userGroupCreationBlock = this._localUser.blockGenerator.createUserGroup(
      groupSignatureKeyPair,
      tcrypto.makeEncryptionKeyPair(),
      users,
      provisionalUsers
    );

    await this._client.sendBlock(userGroupCreationBlock);
    await this._trustchain.sync();

    return utils.toBase64(groupSignatureKeyPair.publicKey);
  }

  async updateGroupMembers(groupId: string, publicIdentities: Array<b64string>): Promise<void> {
    if (publicIdentities.length === 0)
      throw new InvalidArgument(`Cannot add no member to group ${groupId}`);
    if (publicIdentities.length > MAX_GROUP_SIZE)
      throw new GroupTooBig(`Cannot add more than ${MAX_GROUP_SIZE} members to ${groupId}`);

    const internalGroupId = utils.fromBase64(groupId);
    await this._fetchGroups([internalGroupId]);

    const existingGroup = await this._groupStore.findFull({ groupId: internalGroupId });

    if (!existingGroup) {
      throw new InvalidArgument('groupId', 'string', groupId);
    }

    const deserializedIdentities = publicIdentities.map(i => _deserializePublicIdentity(i));
    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentities);
    const users = await this._userAccessor.getUsers({ publicIdentities: permanentIdentities });
    const provisionalUsers = await this._client.getProvisionalUsers(provisionalIdentities);

    // no need to keep the keys, we will get them when we receive the group block
    const userGroupAdditionBlock = this._localUser.blockGenerator.addToUserGroup(
      internalGroupId,
      existingGroup.signatureKeyPair.privateKey,
      existingGroup.lastGroupBlock,
      existingGroup.encryptionKeyPair.privateKey,
      users,
      provisionalUsers,
    );

    await this._client.sendBlock(userGroupAdditionBlock);
    await this._trustchain.sync();
  }

  async _fetchGroups(groupIds: Array<Uint8Array>) {
    await this._trustchain.sync([], groupIds);
    await this._trustchain.updateGroupStore(groupIds);
  }

  async getGroups(groupIds: Array<Uint8Array>): Promise<Array<ExternalGroup>> {
    const groups: Array<ExternalGroup> = [];
    const externalGroups: Array<Uint8Array> = [];
    for (const groupId of groupIds) {
      const group = await this._groupStore.findFull({ groupId });
      if (group) {
        groups.push({
          groupId: group.groupId,
          publicSignatureKey: group.signatureKeyPair.publicKey,
          publicEncryptionKey: group.encryptionKeyPair.publicKey,
          encryptedPrivateSignatureKey: null,
          provisionalEncryptionKeys: [],
          lastGroupBlock: group.lastGroupBlock,
          index: group.index,
        });
      } else {
        externalGroups.push(groupId);
      }
    }

    const missingGroupIds = [];
    if (externalGroups.length)
      await this._fetchGroups(externalGroups);
    for (const groupId of externalGroups) {
      const group = await this._groupStore.findExternal({ groupId });
      if (group)
        groups.push(group);
      else
        missingGroupIds.push(utils.toBase64(groupId));
    }

    if (missingGroupIds.length > 0) {
      const message = `The following groups do not exist on the trustchain: "${missingGroupIds.join('", "')}"`;
      throw new InvalidArgument(message);
    }

    return groups;
  }

  async getGroupEncryptionKeyPair(groupPublicEncryptionKey: Uint8Array) {
    let group = await this._groupStore.findFull({ groupPublicEncryptionKey });
    if (group)
      return group.encryptionKeyPair;

    await this._trustchain.updateGroupStoreWithPublicEncryptionKey(groupPublicEncryptionKey);
    group = await this._groupStore.findFull({ groupPublicEncryptionKey });
    if (group)
      return group.encryptionKeyPair;

    return null;
  }
}
