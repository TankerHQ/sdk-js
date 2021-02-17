// @flow
import { utils, type b64string } from '@tanker/crypto';
import { DecryptionFailed, InternalError } from '@tanker/errors';
import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities } from '@tanker/identity';
import { MergerStream, SlicerStream } from '@tanker/stream-base';
import { castData, getDataLength } from '@tanker/types';

import type { PublicIdentity, PublicProvisionalUser } from '@tanker/identity';
import type { Data } from '@tanker/types';

import { Client } from '../Network/Client';
import LocalUser from '../LocalUser/LocalUser';
import ResourceManager from '../Resources/Manager';
import ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';
import GroupManager from '../Groups/Manager';
import UserManager from '../Users/Manager';

import { extractEncryptionFormat, getSimpleEncryptionWithFixedResourceId, getSimpleEncryption, makeResource, SAFE_EXTRACTION_LENGTH } from './types';
import { makeKeyPublish, makeKeyPublishToProvisionalUser } from '../Resources/Serialize';
import type { Resource } from './types';

import { type User, getLastUserPublicKey } from '../Users/types';
import { NATURE_KIND, type NatureKind } from '../Blocks/Nature';
import { type Status } from '../Session/status';

import type { OutputOptions, ProgressOptions, SharingOptions, EncryptionOptions } from './options';
import { EncryptionStream } from './EncryptionStream';
import { DecryptionStream } from './DecryptionStream';
import { ProgressHandler } from './ProgressHandler';
import { EncryptionSession } from './EncryptionSession';

// Stream encryption will be used starting from this clear data size:
const STREAM_THRESHOLD = 1024 * 1024; // 1MB

export class DataProtector {
  _client: Client;

  _localUser: LocalUser;
  _userManager: UserManager;
  _provisionalIdentityManager: ProvisionalIdentityManager;
  _groupManager: GroupManager;
  _resourceManager: ResourceManager;

  constructor(
    client: Client,
    localUser: LocalUser,
    userManager: UserManager,
    provisionalIdentityManager: ProvisionalIdentityManager,
    groupManager: GroupManager,
    resourceManager: ResourceManager,
  ) {
    this._client = client;
    this._groupManager = groupManager;
    this._localUser = localUser;
    this._userManager = userManager;
    this._provisionalIdentityManager = provisionalIdentityManager;
    this._resourceManager = resourceManager;
  }

  _makeKeyPublishBlocks(
    resource: Array<Resource>,
    keys: Array<Uint8Array>,
    natureKind: NatureKind
  ): Array<b64string> {
    const blocks: Array<b64string> = [];
    for (const publicEncryptionKey of keys) {
      for (const { key, resourceId } of resource) {
        const { payload, nature } = makeKeyPublish(publicEncryptionKey, key, resourceId, natureKind);
        blocks.push(this._localUser.makeBlock(payload, nature));
      }
    }
    return blocks;
  }

  _makeKeyPublishToProvisionalIdentityBlocks(
    resource: Array<Resource>,
    provisionalUsers: Array<PublicProvisionalUser>
  ): Array<b64string> {
    const blocks: Array<b64string> = [];
    for (const provisionalUser of provisionalUsers) {
      for (const { key, resourceId } of resource) {
        const { payload, nature } = makeKeyPublishToProvisionalUser(provisionalUser, key, resourceId);
        blocks.push(this._localUser.makeBlock(payload, nature));
      }
    }
    return blocks;
  }

  async _publishKeys(
    resource: Array<Resource>,
    recipientUsers: Array<User>,
    recipientProvisionalUsers: Array<PublicProvisionalUser>,
    recipientGroupsEncryptionKeys: Array<Uint8Array>
  ): Promise<void> {
    const body = {
      key_publishes_to_user: [],
      key_publishes_to_user_group: [],
      key_publishes_to_provisional_user: [],
    };

    if (recipientGroupsEncryptionKeys.length > 0) {
      body.key_publishes_to_user_group = this._makeKeyPublishBlocks(resource, recipientGroupsEncryptionKeys, NATURE_KIND.key_publish_to_user_group);
    }

    if (recipientProvisionalUsers.length > 0) {
      body.key_publishes_to_provisional_user = this._makeKeyPublishToProvisionalIdentityBlocks(resource, recipientProvisionalUsers);
    }

    if (recipientUsers.length > 0) {
      const keys = recipientUsers.map(user => {
        const userPublicKey = getLastUserPublicKey(user);
        if (!userPublicKey)
          throw new InternalError('Trying to share with a user without user public key');
        return userPublicKey;
      });

      body.key_publishes_to_user = this._makeKeyPublishBlocks(resource, keys, NATURE_KIND.key_publish_to_user);
    }

    await this._client.publishResourceKeys(body);
  }

  _handleShareWithSelf = (identities: Array<PublicIdentity>, shareWithSelf: bool): Array<PublicIdentity> => {
    if (shareWithSelf) {
      const selfUserIdB64 = utils.toBase64(this._localUser.userId);
      const trustchainIdB64 = utils.toBase64(this._localUser.trustchainId);

      if (!identities.some(identity => identity.target === 'user'
                                    && identity.value === selfUserIdB64
                                    && identity.trustchain_id === trustchainIdB64)) {
        return identities.concat([{ trustchain_id: trustchainIdB64, target: 'user', value: selfUserIdB64 }]);
      }
    }

    return identities;
  }

  async _shareResources(keys: Array<Resource>, encryptionOptions: EncryptionOptions): Promise<void> {
    const groupIds = (encryptionOptions.shareWithGroups || []).map(g => utils.fromBase64(g));
    const groupsKeys = await this._groupManager.getGroupsPublicEncryptionKeys(groupIds);
    const deserializedIdentities = (encryptionOptions.shareWithUsers || []).map(i => _deserializePublicIdentity(i));
    if (encryptionOptions.shareWithSelf === undefined)
      throw new InternalError('Assertion error: shareWithSelf must be defined here');
    const deserializedIdentitiesWithSelf = this._handleShareWithSelf(deserializedIdentities, encryptionOptions.shareWithSelf);
    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentitiesWithSelf);
    const users = await this._userManager.getUsers(permanentIdentities, { isLight: true });
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);

    if (encryptionOptions.shareWithSelf) {
      const [{ resourceId, key }] = keys;
      await this._resourceManager.saveResourceKey(resourceId, key);
    }

    return this._publishKeys(keys, users, provisionalUsers, groupsKeys);
  }

  async _simpleDecryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const castEncryptedData = await castData(encryptedData, { type: Uint8Array });

    const encryption = extractEncryptionFormat(castEncryptedData);
    const encryptedSize = getDataLength(castEncryptedData);
    // $FlowIgnore Already checked we are using a simple encryption
    const clearSize = encryption.getClearSize(encryptedSize);
    const progressHandler = new ProgressHandler(progressOptions).start(clearSize);

    const resourceId = encryption.extractResourceId(castEncryptedData);
    const key = await this._resourceManager.findKeyFromResourceId(resourceId);

    let clearData;

    try {
    // $FlowIgnore Already checked we are using a simple encryption
      clearData = encryption.decrypt(key, encryption.unserialize(castEncryptedData));
    } catch (error) {
      const b64ResourceId = utils.toBase64(resourceId);
      throw new DecryptionFailed({ error, b64ResourceId });
    }

    const castClearData = await castData(clearData, outputOptions);

    progressHandler.report(clearSize);

    return castClearData;
  }

  async _streamDecryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const slicer = new SlicerStream({ source: encryptedData });
    const decryptor = await this.createDecryptionStream();
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

  async _simpleEncryptData<T: Data>(clearData: Data, encryptionOptions: EncryptionOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const encryption = getSimpleEncryption();

    const clearSize = getDataLength(clearData);
    const encryptedSize = encryption.getEncryptedSize(clearSize);
    const progressHandler = new ProgressHandler(progressOptions).start(encryptedSize);

    const castClearData = await castData(clearData, { type: Uint8Array });
    const { key } = makeResource();
    const encryptedData = encryption.serialize(encryption.encrypt(key, castClearData));
    const resourceId = encryption.extractResourceId(encryptedData);
    await this._shareResources([{ resourceId, key }], encryptionOptions);
    const castEncryptedData = await castData(encryptedData, outputOptions);

    progressHandler.report(encryptedSize);

    return castEncryptedData;
  }

  async _simpleEncryptDataWithResource<T: Data>(clearData: Data, sharingOptions: SharingOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, resource: Resource): Promise<T> {
    const encryption = getSimpleEncryptionWithFixedResourceId();

    const clearSize = getDataLength(clearData);
    const encryptedSize = encryption.getEncryptedSize(clearSize);
    const progressHandler = new ProgressHandler(progressOptions).start(encryptedSize);

    const castClearData = await castData(clearData, { type: Uint8Array });
    if (!resource)
      throw new InternalError('Assertion error: called _simpleEncryptDataWithResource without a resource');
    const encryptedData = encryption.serialize(encryption.encrypt(resource.key, castClearData, resource.resourceId));
    const castEncryptedData = await castData(encryptedData, outputOptions);

    progressHandler.report(encryptedSize);

    return castEncryptedData;
  }

  async _streamEncryptData<T: Data>(clearData: Data, encryptionOptions: EncryptionOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, resource?: Resource): Promise<T> {
    const slicer = new SlicerStream({ source: clearData });
    const encryptor = await this.createEncryptionStream(encryptionOptions, resource);

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

  async encryptData<T: Data>(clearData: Data, encryptionOptions: EncryptionOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, resource?: Resource): Promise<T> {
    if (getDataLength(clearData) >= STREAM_THRESHOLD)
      return this._streamEncryptData(clearData, encryptionOptions, outputOptions, progressOptions, resource);

    if (resource)
      return this._simpleEncryptDataWithResource(clearData, encryptionOptions, outputOptions, progressOptions, resource);

    return this._simpleEncryptData(clearData, encryptionOptions, outputOptions, progressOptions);
  }

  async share(resourceIds: Array<b64string>, sharingOptions: SharingOptions): Promise<void> {
    // nothing to return, just wait for the promises to finish
    const uniqueResourceIds = [...new Set(resourceIds)];
    const keys = await Promise.all(uniqueResourceIds.map(async (b64ResourceId) => {
      const resourceId = utils.fromBase64(b64ResourceId);
      const key = await this._resourceManager.findKeyFromResourceId(resourceId);
      return { resourceId, key };
    }));
    return this._shareResources(keys, { ...sharingOptions, shareWithSelf: false });
  }

  async createEncryptionStream(encryptionOptions: EncryptionOptions, resource?: Resource): Promise<EncryptionStream> {
    let encryptionStream;

    if (resource) {
      encryptionStream = new EncryptionStream(resource.resourceId, resource.key);
    } else {
      const newResource = makeResource();
      await this._shareResources([newResource], encryptionOptions);
      encryptionStream = new EncryptionStream(newResource.resourceId, newResource.key);
    }

    return encryptionStream;
  }

  async createDecryptionStream(): Promise<DecryptionStream> {
    const resourceIdKeyMapper = {
      findKey: (resourceId) => this._resourceManager.findKeyFromResourceId(resourceId)
    };
    return new DecryptionStream(resourceIdKeyMapper);
  }

  async createEncryptionSession(subscribeToStatusChange: (listener: (status: Status) => void) => void, encryptionOptions: EncryptionOptions): Promise<EncryptionSession> {
    const resource = makeResource();
    await this._shareResources([resource], encryptionOptions);

    const encryptionSession = new EncryptionSession(this, resource);
    subscribeToStatusChange((s) => encryptionSession.statusChange(s));
    return encryptionSession;
  }
}

export default DataProtector;
