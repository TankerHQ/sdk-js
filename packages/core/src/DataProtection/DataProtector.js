// @flow
import { utils, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities } from '@tanker/identity';
import { MergerStream, SlicerStream } from '@tanker/stream-base';
import { castData, getDataLength } from '@tanker/types';

import type { PublicIdentity, PublicProvisionalUser } from '@tanker/identity';
import type { Data } from '@tanker/types';

import { DecryptionFailed } from '../errors';
import { ResourceManager } from './Resource/ResourceManager';
import ResourceStore from './Resource/ResourceStore';
import { KeyDecryptor } from './Resource/KeyDecryptor';

import { type Block } from '../Blocks/Block';
import { Client } from '../Network/Client';
import LocalUser from '../Session/LocalUser';
import GroupManager from '../Groups/Manager';
import UserAccessor from '../Users/UserAccessor';
import { type User, getLastUserPublicKey } from '../Users/User';
import { type ExternalGroup } from '../Groups/types';
import { NATURE_KIND, type NatureKind } from '../Blocks/Nature';
import { extractEncryptionFormat, getSimpleEncryptionWithFixedResourceId, getSimpleEncryption, makeResource, SAFE_EXTRACTION_LENGTH } from './Resource';
import type { Resource } from './Resource';
import type { OutputOptions, ProgressOptions, SharingOptions } from './options';
import EncryptorStream from './EncryptorStream';
import DecryptorStream from './DecryptorStream';
import { ProgressHandler } from './ProgressHandler';

// Stream encryption will be used starting from this clear data size:
const STREAM_THRESHOLD = 1024 * 1024; // 1MB

export class DataProtector {
  _resourceManager: ResourceManager;
  _client: Client;

  _groupManager: GroupManager;
  _localUser: LocalUser;
  _userAccessor: UserAccessor;

  constructor(
    resourceStore: ResourceStore,
    client: Client,
    groupManager: GroupManager,
    localUser: LocalUser,
    userAccessor: UserAccessor,
  ) {
    this._resourceManager = new ResourceManager(
      resourceStore,
      client,
      new KeyDecryptor(
        localUser,
        groupManager
      ),
    );
    this._client = client;
    this._groupManager = groupManager;
    this._localUser = localUser;
    this._userAccessor = userAccessor;
  }

  _makeKeyPublishBlocks(
    resource: Array<Resource>,
    keys: Array<Uint8Array>,
    nature: NatureKind
  ): Array<Block> {
    const blocks: Array<Block> = [];
    for (const publicEncryptionKey of keys) {
      for (const { key, resourceId } of resource) {
        const block = this._localUser.blockGenerator.makeKeyPublishBlock(publicEncryptionKey, key, resourceId, nature);
        blocks.push(block);
      }
    }
    return blocks;
  }

  _makeKeyPublishToProvisionalIdentityBlocks(
    resource: Array<Resource>,
    provisionalUsers: Array<PublicProvisionalUser>
  ): Array<Block> {
    const blocks: Array<Block> = [];
    for (const provisionalUser of provisionalUsers) {
      for (const { key, resourceId } of resource) {
        blocks.push(this._localUser.blockGenerator.makeKeyPublishToProvisionalUserBlock(provisionalUser, key, resourceId));
      }
    }
    return blocks;
  }

  async _publishKeys(
    resource: Array<Resource>,
    recipientUsers: Array<User>,
    recipientProvisionalUsers: Array<PublicProvisionalUser>,
    recipientGroups: Array<ExternalGroup>
  ): Promise<void> {
    let blocks: Array<Block> = [];
    if (recipientGroups.length > 0) {
      const keys = recipientGroups.map(group => group.publicEncryptionKey);

      blocks = blocks.concat(this._makeKeyPublishBlocks(resource, keys, NATURE_KIND.key_publish_to_user_group));
    }

    if (recipientProvisionalUsers.length > 0) {
      blocks = blocks.concat(this._makeKeyPublishToProvisionalIdentityBlocks(resource, recipientProvisionalUsers));
    }

    if (recipientUsers.length > 0) {
      const keys = recipientUsers.map(user => {
        const userPublicKey = getLastUserPublicKey(user);
        if (!userPublicKey)
          throw new InternalError('Trying to share with a user without user public key');
        return userPublicKey;
      });

      blocks = blocks.concat(this._makeKeyPublishBlocks(resource, keys, NATURE_KIND.key_publish_to_user));
    }

    await this._client.sendKeyPublishBlocks(blocks);
  }

  _handleShareWithSelf = (identities: Array<PublicIdentity>, shareWithSelf: bool): Array<PublicIdentity> => {
    if (shareWithSelf) {
      const selfUserIdentity = this._localUser.publicIdentity;
      if (!identities.some(identity => identity.target === 'user'
                                    && identity.value === selfUserIdentity.value
                                    && identity.trustchain_id === selfUserIdentity.trustchain_id)) {
        return identities.concat([selfUserIdentity]);
      }
    }

    return identities;
  }

  async _shareResources(keys: Array<{ resourceId: Uint8Array, key: Uint8Array }>, sharingOptions: SharingOptions, shareWithSelf: bool): Promise<void> {
    const groupIds = (sharingOptions.shareWithGroups || []).map(g => utils.fromBase64(g));
    const groups = await this._groupManager.getGroups(groupIds);
    const deserializedIdentities = (sharingOptions.shareWithUsers || []).map(i => _deserializePublicIdentity(i));
    const deserializedIdentitiesWithSelf = this._handleShareWithSelf(deserializedIdentities, shareWithSelf);
    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentitiesWithSelf);
    const users = await this._userAccessor.getUsers({ publicIdentities: permanentIdentities });
    const provisionalUsers = await this._client.getProvisionalUsers(provisionalIdentities);

    if (shareWithSelf) {
      const [{ resourceId, key }] = keys;
      await this._resourceManager.saveResourceKey(resourceId, key);
    }

    return this._publishKeys(keys, users, provisionalUsers, groups);
  }

  async _simpleDecryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const castEncryptedData = await castData(encryptedData, { type: Uint8Array });

    const encryption = extractEncryptionFormat(castEncryptedData);
    const encryptedSize = getDataLength(castEncryptedData);
    // $FlowIKnow Already checked we are using a simple encryption
    const clearSize = encryption.getClearSize(encryptedSize);
    const progressHandler = new ProgressHandler(progressOptions).start(clearSize);

    const resourceId = encryption.extractResourceId(castEncryptedData);
    const key = await this._resourceManager.findKeyFromResourceId(resourceId);

    let clearData;

    try {
    // $FlowIKnow Already checked we are using a simple encryption
      clearData = encryption.decrypt(key, encryption.unserialize(castEncryptedData));
    } catch (error) {
      throw new DecryptionFailed({ error, resourceId });
    }

    const castClearData = await castData(clearData, outputOptions);

    progressHandler.report(clearSize);

    return castClearData;
  }

  async _streamDecryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const slicer = new SlicerStream({ source: encryptedData });
    const decryptor = await this.makeDecryptorStream();
    const merger = new MergerStream(outputOptions);

    const progressHandler = new ProgressHandler(progressOptions);

    decryptor.on('initialized', () => {
      const encryptedSize = getDataLength(encryptedData);
      const clearSize = decryptor.getClearSize(encryptedSize);
      progressHandler.start(clearSize);
    });

    decryptor.on('data', (chunk: Uint8Array) => progressHandler.report(chunk.byteLength));

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const leadingBytes = await castData(encryptedData, { type: Uint8Array }, SAFE_EXTRACTION_LENGTH);
    const encryption = extractEncryptionFormat(leadingBytes);

    if (encryption.features.chunks)
      return this._streamDecryptData(encryptedData, outputOptions, progressOptions);

    return this._simpleDecryptData(encryptedData, outputOptions, progressOptions);
  }

  async _simpleEncryptData<T: Data>(clearData: Data, sharingOptions: SharingOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const encryption = getSimpleEncryption();

    const clearSize = getDataLength(clearData);
    const encryptedSize = encryption.getEncryptedSize(clearSize);
    const progressHandler = new ProgressHandler(progressOptions).start(encryptedSize);

    const castClearData = await castData(clearData, { type: Uint8Array });
    const { key } = makeResource();
    const encryptedData = encryption.serialize(encryption.encrypt(key, castClearData));
    const resourceId = encryption.extractResourceId(encryptedData);
    await this._shareResources([{ resourceId, key }], sharingOptions, true);
    const castEncryptedData = await castData(encryptedData, outputOptions);

    progressHandler.report(encryptedSize);

    return castEncryptedData;
  }

  async _simpleEncryptDataWithResourceId<T: Data>(clearData: Data, sharingOptions: SharingOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, b64ResourceId: b64string): Promise<T> {
    const encryption = getSimpleEncryptionWithFixedResourceId();

    const clearSize = getDataLength(clearData);
    const encryptedSize = encryption.getEncryptedSize(clearSize);
    const progressHandler = new ProgressHandler(progressOptions).start(encryptedSize);

    const castClearData = await castData(clearData, { type: Uint8Array });
    if (typeof b64ResourceId !== 'string')
      throw new InternalError('Assertion error: called _simpleEncryptDataWithResourceId without a resourceId');
    const resourceId = utils.fromBase64(b64ResourceId);
    const key = await this._resourceManager.findKeyFromResourceId(resourceId);
    const encryptedData = encryption.serialize(encryption.encrypt(key, castClearData, resourceId));
    const castEncryptedData = await castData(encryptedData, outputOptions);

    progressHandler.report(encryptedSize);

    return castEncryptedData;
  }

  async _streamEncryptData<T: Data>(clearData: Data, sharingOptions: SharingOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, b64ResourceId?: b64string): Promise<T> {
    const slicer = new SlicerStream({ source: clearData });
    const encryptor = await this.makeEncryptorStream(sharingOptions, b64ResourceId);

    const clearSize = getDataLength(clearData);
    const encryptedSize = encryptor.getEncryptedSize(clearSize);
    const progressHandler = new ProgressHandler(progressOptions).start(encryptedSize);
    encryptor.on('data', (chunk: Uint8Array) => progressHandler.report(chunk.byteLength));

    const merger = new MergerStream(outputOptions);

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async encryptData<T: Data>(clearData: Data, sharingOptions: SharingOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, b64ResourceId?: b64string): Promise<T> {
    if (getDataLength(clearData) >= STREAM_THRESHOLD)
      return this._streamEncryptData(clearData, sharingOptions, outputOptions, progressOptions, b64ResourceId);

    if (b64ResourceId)
      return this._simpleEncryptDataWithResourceId(clearData, sharingOptions, outputOptions, progressOptions, b64ResourceId);

    return this._simpleEncryptData(clearData, sharingOptions, outputOptions, progressOptions);
  }

  async share(resourceIds: Array<b64string>, sharingOptions: SharingOptions): Promise<void> {
    // nothing to return, just wait for the promises to finish
    const keys = await Promise.all(resourceIds.map(async (b64ResourceId) => {
      const resourceId = utils.fromBase64(b64ResourceId);
      const key = await this._resourceManager.findKeyFromResourceId(resourceId);
      return { resourceId, key };
    }));

    return this._shareResources(keys, sharingOptions, false);
  }

  async makeEncryptorStream(sharingOptions: SharingOptions, b64ResourceId?: b64string): Promise<EncryptorStream> {
    let encryptorStream;

    if (b64ResourceId) {
      const resourceId = utils.fromBase64(b64ResourceId);
      const key = await this._resourceManager.findKeyFromResourceId(resourceId);
      encryptorStream = new EncryptorStream(resourceId, key);
    } else {
      const resource = makeResource();
      await this._shareResources([resource], sharingOptions, true);
      encryptorStream = new EncryptorStream(resource.resourceId, resource.key);
    }

    return encryptorStream;
  }

  async makeDecryptorStream(): Promise<DecryptorStream> {
    const resourceIdKeyMapper = {
      findKey: (resourceId) => this._resourceManager.findKeyFromResourceId(resourceId)
    };
    return new DecryptorStream(resourceIdKeyMapper);
  }
}

export default DataProtector;
