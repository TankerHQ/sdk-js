import type { b64string, EncryptionFormatDescription, SimpleEncryptor } from '@tanker/crypto';
import { utils, extractEncryptionFormat, isStreamEncryptionFormat, SAFE_EXTRACTION_LENGTH, getClearSize, paddedFromClearSize, Padding, EncryptionStreamV4, EncryptionStreamV8, DecryptionStream } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import { MergerStream, SlicerStream } from '@tanker/stream-base';
import { castData, getDataLength } from '@tanker/types';

import type { Data } from '@tanker/types';

import { _deserializePublicIdentity, _splitProvisionalAndPermanentPublicIdentities, assertTrustchainId } from '../Identity';
import type { PublicIdentity, PublicProvisionalUser } from '../Identity';
import type { Client } from '../Network/Client';
import type LocalUser from '../LocalUser/LocalUser';
import type ResourceManager from '../Resources/Manager';
import type ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';
import type GroupManager from '../Groups/Manager';
import type UserManager from '../Users/Manager';

import { getSimpleEncryptionWithFixedResourceId, getSimpleEncryption, makeResource } from './types';
import { makeKeyPublish, makeKeyPublishToProvisionalUser } from '../Resources/Serialize';
import type { Resource } from './types';

import type { User } from '../Users/types';
import { getLastUserPublicKey } from '../Users/types';
import { NATURE_KIND } from '../Blocks/Nature';
import type { NatureKind } from '../Blocks/Nature';
import type { Status } from '../Session/status';

import type { OutputOptions, ProgressOptions, SharingOptions, EncryptionOptions } from './options';
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
    natureKind: NatureKind,
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
    provisionalUsers: Array<PublicProvisionalUser>,
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
    recipientGroupsEncryptionKeys: Array<Uint8Array>,
  ): Promise<void> {
    const body = {
      key_publishes_to_user: [] as Array<b64string>,
      key_publishes_to_user_group: [] as Array<b64string>,
      key_publishes_to_provisional_user: [] as Array<b64string>,
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

  _handleShareWithSelf = (identities: Array<PublicIdentity>, shareWithSelf: boolean): Array<PublicIdentity> => {
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
  };

  async _shareResources(keys: Array<Resource>, encryptionOptions: EncryptionOptions): Promise<void> {
    const groupIds = encryptionOptions.shareWithGroups || [];
    const groupsKeys = await this._groupManager.getGroupsPublicEncryptionKeys(groupIds);
    const deserializedIdentities = (encryptionOptions.shareWithUsers || []).map(i => _deserializePublicIdentity(i));
    assertTrustchainId(deserializedIdentities, this._localUser.trustchainId);

    if (encryptionOptions.shareWithSelf === undefined)
      throw new InternalError('Assertion error: shareWithSelf must be defined here');
    const deserializedIdentitiesWithSelf = this._handleShareWithSelf(deserializedIdentities, encryptionOptions.shareWithSelf);
    const { permanentIdentities, provisionalIdentities } = _splitProvisionalAndPermanentPublicIdentities(deserializedIdentitiesWithSelf);
    const users = await this._userManager.getUsers(permanentIdentities, { isLight: true });
    const provisionalUsers = await this._provisionalIdentityManager.getProvisionalUsers(provisionalIdentities);

    if (encryptionOptions.shareWithSelf) {
      const { resourceId, key } = keys[0]!;
      await this._resourceManager.saveResourceKey(resourceId, key);
    }

    return this._publishKeys(keys, users, provisionalUsers, groupsKeys);
  }

  async _simpleDecryptData<T extends Data>(encryptedData: Data, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const castEncryptedData = await castData(encryptedData, { type: Uint8Array });

    const encryption = extractEncryptionFormat(castEncryptedData) as SimpleEncryptor;
    const encryptedSize = getDataLength(castEncryptedData);
    const clearSize = encryption.getClearSize(encryptedSize);
    const progressHandler = new ProgressHandler(progressOptions).start(clearSize);

    const keyMapper = (keyID: Uint8Array) => this._resourceManager.findKeyFromResourceId(keyID);

    const clearData = await encryption.decrypt(keyMapper, encryption.unserialize(castEncryptedData));

    const castClearData = await castData(clearData, outputOptions);

    progressHandler.report(clearSize);

    return castClearData;
  }

  async _streamDecryptData<T extends Data>(encryptedData: Data, encryptionFormat: EncryptionFormatDescription, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const slicer = new SlicerStream({ source: encryptedData });
    const decryptor = await this.createDecryptionStream();
    const merger = new MergerStream(outputOptions);

    const progressHandler = new ProgressHandler(progressOptions);

    decryptor.on('initialized', () => {
      const encryptedSize = getDataLength(encryptedData);
      const clearSize = getClearSize({ ...encryptionFormat, encryptedChunkSize: decryptor.encryptedChunkSize() }, encryptedSize);
      progressHandler.start(clearSize);
    });

    decryptor.on('data', (chunk: Uint8Array) => progressHandler.report(chunk.byteLength));

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData<T extends Data>(encryptedData: Data, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const leadingBytes = await castData(encryptedData, { type: Uint8Array }, SAFE_EXTRACTION_LENGTH);
    const encryptionFormat = extractEncryptionFormat(leadingBytes);

    if (isStreamEncryptionFormat(encryptionFormat))
      return this._streamDecryptData(encryptedData, { version: encryptionFormat.version }, outputOptions, progressOptions);

    return this._simpleDecryptData(encryptedData, outputOptions, progressOptions);
  }

  async _simpleEncryptData<T extends Data>(clearData: Data, encryptionOptions: EncryptionOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const paddingStep = encryptionOptions.paddingStep;
    const encryption = getSimpleEncryption(paddingStep);

    const clearSize = getDataLength(clearData);
    const encryptedSize = encryption.getEncryptedSize(clearSize, paddingStep);
    const progressHandler = new ProgressHandler(progressOptions).start(encryptedSize);

    const castClearData = await castData(clearData, { type: Uint8Array });
    const { key } = makeResource();
    const encryptedData = encryption.serialize(encryption.encrypt(key, castClearData, paddingStep));
    const resourceId = encryption.extractResourceId(encryptedData);
    await this._shareResources([{ resourceId, key }], encryptionOptions);
    const castEncryptedData = await castData(encryptedData, outputOptions);

    progressHandler.report(encryptedSize);

    return castEncryptedData;
  }

  async _simpleEncryptDataWithResource<T extends Data>(clearData: Data, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, resource: Resource, paddingStep?: number | Padding): Promise<T> {
    const encryption = getSimpleEncryptionWithFixedResourceId(paddingStep);

    const clearSize = getDataLength(clearData);
    const encryptedSize = encryption.getEncryptedSize(clearSize, paddingStep);
    const progressHandler = new ProgressHandler(progressOptions).start(encryptedSize);

    const castClearData = await castData(clearData, { type: Uint8Array });
    if (!resource)
      throw new InternalError('Assertion error: called _simpleEncryptDataWithResource without a resource');
    const encryptedData = encryption.serialize(encryption.encrypt(resource.key, castClearData, resource.resourceId, paddingStep));
    const castEncryptedData = await castData(encryptedData, outputOptions);

    progressHandler.report(encryptedSize);

    return castEncryptedData;
  }

  async _streamEncryptData<T extends Data>(clearData: Data, encryptionOptions: EncryptionOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, resource?: Resource): Promise<T> {
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

  async encryptData<T extends Data>(clearData: Data, encryptionOptions: EncryptionOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions, resource?: Resource): Promise<T> {
    if (paddedFromClearSize(getDataLength(clearData), encryptionOptions.paddingStep) >= STREAM_THRESHOLD)
      return this._streamEncryptData(clearData, encryptionOptions, outputOptions, progressOptions, resource);

    if (resource) {
      // We can ignore the EncryptionOptions (aka SharingOptions) other than paddingStep because this path is only
      // accessed through UploadStream and Encryption session which both manage the share operation on their own
      return this._simpleEncryptDataWithResource(clearData, outputOptions, progressOptions, resource, encryptionOptions.paddingStep);
    }

    return this._simpleEncryptData(clearData, encryptionOptions, outputOptions, progressOptions);
  }

  async share(resourceIds: Array<b64string>, sharingOptions: SharingOptions): Promise<void> {
    // nothing to return, just wait for the promises to finish
    const uniqueResourceIds = [...new Set(resourceIds)];
    const keys = await Promise.all(uniqueResourceIds.map(async b64ResourceId => {
      const resourceId = utils.fromBase64(b64ResourceId);
      const key = await this._resourceManager.findKeyFromResourceId(resourceId);
      return { resourceId, key };
    }));
    return this._shareResources(keys, { ...sharingOptions, shareWithSelf: false });
  }

  async createEncryptionStream(encryptionOptions: EncryptionOptions, resource?: Resource): Promise<EncryptionStreamV4 | EncryptionStreamV8> {
    let resourceFinal;
    if (resource) {
      resourceFinal = resource;
    } else {
      resourceFinal = makeResource();
      await this._shareResources([resourceFinal], encryptionOptions);
    }

    let encryptionStream;
    if (encryptionOptions.paddingStep === Padding.OFF) {
      encryptionStream = new EncryptionStreamV4(resourceFinal.resourceId, resourceFinal.key);
    } else {
      encryptionStream = new EncryptionStreamV8(resourceFinal.resourceId, resourceFinal.key, encryptionOptions.paddingStep);
    }

    return encryptionStream;
  }

  async createDecryptionStream(): Promise<DecryptionStream> {
    const keyMapper = (keyId: Uint8Array) => this._resourceManager.findKeyFromResourceId(keyId);
    return new DecryptionStream(keyMapper);
  }

  async createEncryptionSession(getStatus: () => Status, encryptionOptions: EncryptionOptions): Promise<EncryptionSession> {
    const resource = makeResource();
    await this._shareResources([resource], encryptionOptions);

    return new EncryptionSession(this, getStatus, resource, encryptionOptions.paddingStep);
  }
}

export default DataProtector;
