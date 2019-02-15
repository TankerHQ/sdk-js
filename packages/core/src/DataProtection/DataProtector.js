// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { ResourceNotFound, DecryptFailed } from '../errors';
import { ResourceManager, getResourceId } from '../Resource/ResourceManager';
import { type Block } from '../Blocks/Block';
import { Client } from '../Network/Client';
import LocalUser from '../Session/LocalUser';
import GroupManager from '../Groups/Manager';
import UserAccessor from '../Users/UserAccessor';
import { type User, getLastUserPublicKey } from '../Users/User';
import { type ExternalGroup } from '../Groups/types';
import { NATURE_KIND, type NatureKind } from '../Blocks/Nature';
import { DEVICE_TYPE } from '../Unlock/unlock';
import { decryptData } from './decrypt';
import { encryptData } from './encrypt';
import { type EncryptionOptions } from './EncryptionOptions';
import { type ShareWithOptions } from './ShareWithOptions';
import ChunkEncryptor, { makeChunkEncryptor, type EncryptorInterface } from './ChunkEncryptor';
import EncryptorStream from './EncryptorStream';
import DecryptorStream from './DecryptorStream';

export type KeyResourceId = {
  key: Uint8Array,
  resourceId: Uint8Array,
};

export default class DataProtector {
  _resourceManager: ResourceManager;
  _client: Client;

  _groupManager: GroupManager;
  _localUser: LocalUser;
  _userAccessor: UserAccessor;

  constructor(
    resourceManager: ResourceManager,
    client: Client,
    groupManager: GroupManager,
    localUser: LocalUser,
    userAccessor: UserAccessor,
  ) {
    this._resourceManager = resourceManager;
    this._client = client;
    this._groupManager = groupManager;
    this._localUser = localUser;
    this._userAccessor = userAccessor;
  }

  _makeKeyPublishBlocks(
    keyResourceIds: Array<KeyResourceId>,
    keys: Array<Uint8Array>,
    nature: NatureKind
  ): Array<Block> {
    const blocks: Array<Block> = [];
    for (const publicEncryptionKey of keys) {
      for (const { key, resourceId } of keyResourceIds) {
        const block = this._localUser.blockGenerator.makeKeyPublishBlock(publicEncryptionKey, key, resourceId, nature);
        blocks.push(block);
      }
    }
    return blocks;
  }

  async _publishKeys(
    keyResourceIds: Array<KeyResourceId>,
    recipientUsers: Array<User>,
    recipientGroups: Array<ExternalGroup>
  ): Promise<void> {
    let blocks: Array<Block> = [];
    if (recipientGroups.length > 0) {
      const keys = recipientGroups.map(group => group.publicEncryptionKey);

      blocks = blocks.concat(this._makeKeyPublishBlocks(keyResourceIds, keys, NATURE_KIND.key_publish_to_user_group));
    }

    if (recipientUsers.length > 0) {
      const keys = recipientUsers.map(user => {
        const userPublicKey = getLastUserPublicKey(user);
        if (!userPublicKey)
          throw new Error('Trying to share to a user without user public key');
        return userPublicKey;
      });

      blocks = blocks.concat(this._makeKeyPublishBlocks(keyResourceIds, keys, NATURE_KIND.key_publish_to_user));
    }

    await this._client.sendKeyPublishBlocks(blocks);
  }

  async _separateGroupsFromUsers(shareWith: Array<string>): Object {
    const maybeGroupIds = shareWith.map(utils.fromBase64).filter(id => id.length === tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    const groups = await this._groupManager.findGroups(maybeGroupIds);
    const b64groupIds = groups.map(group => utils.toBase64(group.groupId));
    const userIds = shareWith.filter(id => b64groupIds.indexOf(id) === -1);
    const users = await this._userAccessor.getUsers({ userIds });

    return {
      users,
      groups,
    };
  }

  _handleShareWithSelf = (ids: Array<string>, shareWithSelf: bool): Array<string> => {
    if (shareWithSelf) {
      const selfUserId = this._localUser.clearUserId;
      if (ids.indexOf(selfUserId) === -1) {
        return ids.concat([selfUserId]);
      }
    }

    return ids;
  }

  async _shareResources(keys: Array<{ resourceId: Uint8Array, key: Uint8Array }>, shareWithOptions: ShareWithOptions, shareWithSelf: bool): Promise<void> {
    let groups;
    let users;

    // deprecated format:
    if (shareWithOptions.shareWith) {
      const mixedIds = this._handleShareWithSelf(shareWithOptions.shareWith, shareWithSelf);
      ({ groups, users } = await this._separateGroupsFromUsers(mixedIds));
    } else {
      const groupIds = (shareWithOptions.shareWithGroups || []).map(g => utils.fromBase64(g));
      const userIds = this._handleShareWithSelf(shareWithOptions.shareWithUsers || [], shareWithSelf);
      groups = await this._groupManager.findGroups(groupIds);
      users = await this._userAccessor.getUsers({ userIds });
    }

    if (shareWithSelf) {
      const [{ resourceId, key }] = keys;
      await this._resourceManager.saveResourceKey(resourceId, key);
    }

    return this._publishKeys(keys, users, groups);
  }

  async decryptData(protectedData: Uint8Array): Promise<Uint8Array> {
    const resourceId = getResourceId(protectedData);
    const key = await this._resourceManager.findKeyFromResourceId(resourceId, true);
    try {
      return await decryptData(key, protectedData);
    } catch (e) {
      throw new DecryptFailed(e, resourceId);
    }
  }

  async encryptAndShareData(data: Uint8Array, options: EncryptionOptions = {}): Promise<Uint8Array> {
    const { key, resourceId, encryptedData } = await encryptData(data);

    await this._shareResources([{ resourceId, key }], options, options.shareWithSelf || false);
    return encryptedData;
  }

  async share(resourceIds: Array<b64string>, shareWith: ShareWithOptions): Promise<void> {
    // nothing to return, just wait for the promises to finish
    const keys = await Promise.all(resourceIds.map(async (b64ResourceId) => {
      const resourceId = utils.fromBase64(b64ResourceId);
      const key = await this._resourceManager.findKeyFromResourceId(resourceId);
      if (!key)
        throw new ResourceNotFound(resourceId);
      return { resourceId, key };
    }));

    return this._shareResources(keys, shareWith, false);
  }

  async makeChunkEncryptor(seal?: Uint8Array): Promise<ChunkEncryptor> {
    const encryptor: EncryptorInterface = {
      encryptData: (data, options) => this.encryptAndShareData(data, options),
      decryptData: (encryptedData) => this.decryptData(encryptedData)
    };
    return makeChunkEncryptor({ encryptor, seal, defaultShareWithSelf: (this._localUser.deviceType === DEVICE_TYPE.client_device) });
  }

  async makeEncryptorStream(options: EncryptionOptions): Promise<EncryptorStream> {
    const streamResource = ResourceManager.makeStreamResource();
    const encryptorStream = new EncryptorStream(streamResource.resourceId, streamResource.key);

    await this._shareResources([streamResource], options, options.shareWithSelf || false);

    return encryptorStream;
  }

  async makeDecryptorStream(): Promise<DecryptorStream> {
    const resourceIdKeyMapper = {
      findKey: (resourceId) => this._resourceManager.findKeyFromResourceId(resourceId, true)
    };
    return new DecryptorStream(resourceIdKeyMapper);
  }
}
