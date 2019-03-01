// @flow

import { tcrypto, utils, type b64string } from '@tanker/crypto';

import UserAccessor from '../Users/UserAccessor';
import LocalUser from '../Session/LocalUser';
import { Client } from '../Network/Client';
import GroupStore from './GroupStore';
import { type ExternalGroup } from './types';
import Trustchain from '../Trustchain/Trustchain';
import { InvalidArgument, InvalidGroupSize, ServerError, InvalidIdentity, TankerError } from '../errors';

function publicIdentityToB64UserId(publicIdentity: b64string): b64string {
  const decodedIdentity = utils.fromB64Json(publicIdentity);
  if (decodedIdentity.target !== 'user')
    throw new InvalidIdentity(new TankerError('A PublicTemporalIdentity cannot have a userId'));
  return decodedIdentity.value;
}

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
      throw new InvalidGroupSize('A group cannot be created empty');
    if (publicIdentities.length > MAX_GROUP_SIZE)
      throw new InvalidGroupSize(`A group cannot have more than ${MAX_GROUP_SIZE} members`);

    const b64userIds = publicIdentities.map(publicIdentityToB64UserId);
    const fullUsers = await this._userAccessor.getUsers({ b64userIds });

    const groupSignatureKeyPair = tcrypto.makeSignKeyPair();

    // no need to keep the keys, we will get them when we receive the group block
    const userGroupCreationBlock = this._localUser.blockGenerator.createUserGroup(
      groupSignatureKeyPair,
      tcrypto.makeEncryptionKeyPair(),
      fullUsers
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

    const b64userIds = publicIdentities.map(publicIdentityToB64UserId);
    const fullUsers = await this._userAccessor.getUsers({ b64userIds });

    const internalGroupId = utils.fromBase64(groupId);
    await this._trustchain.updateGroupStore([internalGroupId]);
    const existingGroup = await this._groupStore.findFull({ groupId: internalGroupId });

    if (!existingGroup) {
      throw new InvalidArgument('groupId', 'string', groupId);
    }

    // no need to keep the keys, we will get them when we receive the group block
    const userGroupCreationBlock = this._localUser.blockGenerator.addToUserGroup(
      internalGroupId,
      existingGroup.signatureKeyPair.privateKey,
      existingGroup.lastGroupBlock,
      existingGroup.encryptionKeyPair.privateKey,
      fullUsers
    );
    try {
      await this._client.sendBlock(userGroupCreationBlock);
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

  async findGroups(groupIds: Array<Uint8Array>): Promise<Array<ExternalGroup>> {
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
          lastGroupBlock: group.lastGroupBlock,
          index: group.index,
        });
      } else {
        externalGroups.push(groupId);
      }
    }

    if (externalGroups.length)
      await this._fetchGroups(externalGroups);
    for (const groupId of externalGroups) {
      const group = await this._groupStore.findExternal({ groupId });
      if (group)
        groups.push(group);
    }

    return groups;
  }
}
