// @flow

import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { _deserializePublicIdentity, type PublicPermanentIdentity, type PublicProvisionalIdentity } from '@tanker/identity';

import UserAccessor from '../Users/UserAccessor';
import LocalUser from '../Session/LocalUser';
import { Client } from '../Network/Client';
import GroupStore from './GroupStore';
import { type ExternalGroup } from './types';
import Trustchain from '../Trustchain/Trustchain';
import { InvalidArgument, InvalidGroupSize, ServerError, RecipientsNotFound } from '../errors';

export const MAX_GROUP_SIZE = 1000;

function splitUsersAndProvisionalUsers(publicIdentities: Array<b64string>): { permanentIdentities: Array<PublicPermanentIdentity>, provisionalIdentities: Array<PublicProvisionalIdentity> } {
  const decodedIdentities: Array<PublicPermanentIdentity | PublicProvisionalIdentity> = publicIdentities.map(_deserializePublicIdentity);
  const hasSecretIdentities = decodedIdentities.some(x => 'user_secret' in x || 'private_encryption_key' in x);
  if (hasSecretIdentities)
    throw new InvalidArgument('Cannot share with secret identities');
  const permanentIdentities: Array<PublicPermanentIdentity> = (decodedIdentities.filter(i => i.target === 'user'): any);
  const provisionalIdentities: Array<PublicProvisionalIdentity> = (decodedIdentities.filter(i => i.target === 'email'): any);
  return { permanentIdentities, provisionalIdentities };
}

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
      throw new InvalidGroupSize('A group cannot be created empty');
    if (publicIdentities.length > MAX_GROUP_SIZE)
      throw new InvalidGroupSize(`A group cannot have more than ${MAX_GROUP_SIZE} members`);

    const { permanentIdentities, provisionalIdentities } = splitUsersAndProvisionalUsers(publicIdentities);
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
      throw new InvalidGroupSize(`Cannot add no member to group ${groupId}`);
    if (publicIdentities.length > MAX_GROUP_SIZE)
      throw new InvalidGroupSize(`Cannot add more than ${MAX_GROUP_SIZE} members to ${groupId}`);

    const internalGroupId = utils.fromBase64(groupId);
    await this._fetchGroups([internalGroupId]);

    const existingGroup = await this._groupStore.findFull({ groupId: internalGroupId });

    if (!existingGroup) {
      throw new InvalidArgument('groupId', 'string', groupId);
    }

    const { permanentIdentities, provisionalIdentities } = splitUsersAndProvisionalUsers(publicIdentities);
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
    try {
      await this._client.sendBlock(userGroupAdditionBlock);
    } catch (e) {
      if ((e instanceof ServerError) && e.error.code === 'group_too_big')
        throw new InvalidGroupSize(`A group cannot contain more than ${MAX_GROUP_SIZE} members`);
      else
        throw e;
    }

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

    const missingGroups = [];
    if (externalGroups.length)
      await this._fetchGroups(externalGroups);
    for (const groupId of externalGroups) {
      const group = await this._groupStore.findExternal({ groupId });
      if (group)
        groups.push(group);
      else
        missingGroups.push(groupId);
    }

    if (missingGroups.length > 0)
      throw new RecipientsNotFound(missingGroups.map(utils.toBase64));

    return groups;
  }
}
