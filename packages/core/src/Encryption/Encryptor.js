// @flow

import varint from 'varint';

import { tcrypto, random, aead, utils, type b64string, type Key } from '@tanker/crypto';

import { type SessionData } from '../Tokens/SessionTypes';
import { ResourceNotFound, DecryptFailed, InvalidEncryptionFormat, InvalidArgument } from '../errors';
import { keyPublish, processKeyPublish } from './keyPublish';
import { concatArrays } from '../Blocks/Serialize';
import { DEVICE_TYPE } from '../Unlock/unlock';
import Trustchain from '../Trustchain/Trustchain';
import UserAccessor from '../Users/UserAccessor';
import Storage from '../Session/Storage';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';

export const currentVersion = 2;

export type EncryptionOptions = {
  shareWithSelf?: bool,
  shareWith?: Array<string>,
};

const defaultEncryptionOptions: EncryptionOptions = {
  shareWith: [],
};

export type DecryptionOptions = {
  timeout: number
};

export interface EncryptorInterface {
  encryptData(plain: Uint8Array, options?: EncryptionOptions): Promise<Uint8Array>;
  decryptData(cipher: Uint8Array, options?: DecryptionOptions): Promise<Uint8Array>;
}

export function getResourceId(serializedData: Uint8Array): Uint8Array {
  const version = varint.decode(serializedData);
  const binaryData = serializedData.subarray(varint.decode.bytes);
  switch (version) {
    case 1:
    case 2:
      return aead.extractResourceId(binaryData);
    default:
      throw new InvalidEncryptionFormat(`unhandled format version in getResourceId: '${version}'`);
  }
}

export type EncryptionResult = {
  key: Uint8Array,
  resourceId: Uint8Array,
  encryptedData: Uint8Array,
};

export async function encryptData(plain: Uint8Array): Promise<EncryptionResult> {
  const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
  const buffer = await aead.encryptAEADv2(key, plain);
  const resourceId = aead.extractResourceId(buffer);
  const encodedVersion = varint.encode(currentVersion);
  return { key, resourceId, encryptedData: concatArrays(encodedVersion, buffer) };
}

export async function decryptData(key: Uint8Array, cipher: Uint8Array): Promise<Uint8Array> {
  const version = varint.decode(cipher);
  const binaryData = cipher.subarray(varint.decode.bytes);

  switch (version) {
    case 1:
      return aead.decryptAEADv1(key, binaryData);
    case 2:
      return aead.decryptAEADv2(key, binaryData);
    default:
      throw new InvalidEncryptionFormat(`unhandled format version in decryptData: '${version}'`);
  }
}

export default class Encryptor implements EncryptorInterface {
  _sessionData: SessionData;
  _storage: Storage;
  _client: Client;
  _trustchain: Trustchain;
  _groupManager: GroupManager;
  _userAccessor: UserAccessor;

  constructor(sessionData: SessionData, storage: Storage, client: Client, trustchain: Trustchain, groupManager: GroupManager, userAccessor: UserAccessor) {
    this._sessionData = sessionData;
    this._storage = storage;
    this._client = client;
    this._trustchain = trustchain;
    this._groupManager = groupManager;
    this._userAccessor = userAccessor;
  }

  async processShareWith(shareWith: Array<string>, shareWithSelf: bool): Object {
    const maybeGroupIds = shareWith.map(utils.fromBase64).filter(id => id.length === tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    const groups = await this._groupManager.findGroups(maybeGroupIds);

    const groupIds = groups.map(group => group.groupId);

    let doWeReallyShareToSelf = shareWithSelf;
    const userIds = [];
    for (const id of shareWith) {
      const rawId = utils.fromBase64(id);
      // skip groups
      if (groupIds.some(g => utils.equalArray(g, rawId)))
        continue;
      // skip self
      if (id === this._sessionData.userId) {
        doWeReallyShareToSelf = true;
        continue;
      }
      userIds.push(id);
    }
    if (doWeReallyShareToSelf) {
      userIds.push(this._sessionData.clearUserId);
    }

    const users = await this._userAccessor.getUsers({ userIds });

    return {
      users,
      groups,
    };
  }

  async encryptData(plain: Uint8Array, options?: EncryptionOptions): Promise<Uint8Array> {
    const { key, resourceId, encryptedData } = await encryptData(plain);

    const opts = { ...defaultEncryptionOptions, shareWithSelf: (this._sessionData.deviceType === DEVICE_TYPE.client_device), ...options };

    if (opts.shareWithSelf === false && opts.shareWith.length === 0) {
      throw new InvalidArgument('options.shareWith', 'shareWith must contain user ids when options.shareWithSelf === false', opts.shareWith);
    }

    if (opts.shareWithSelf) {
      await this._storage.sharedKeystore.saveResourceKey(resourceId, key);
    }

    const { users, groups } = await this.processShareWith(opts.shareWith, opts.shareWithSelf);

    await keyPublish(
      this._client,
      this._storage.keyStore,
      [{ resourceId, key }],
      users,
      groups
    );
    return encryptedData;
  }

  async decryptData(cipher: Uint8Array): Promise<Uint8Array> {
    const resourceId = getResourceId(cipher);
    let key = await this._findResourceKey(resourceId);
    if (!key) {
      await this._trustchain.sync();
      key = await this._findResourceKey(resourceId);
    }
    if (!key) {
      throw new ResourceNotFound(resourceId);
    }
    try {
      return await decryptData(key, cipher);
    } catch (e) {
      throw new DecryptFailed(e, resourceId);
    }
  }

  async _findResourceKey(resourceId: Uint8Array): Promise<?Key> {
    const key = await this._storage.sharedKeystore.findResourceKey(resourceId);
    if (key)
      return key;
    const keyPublishEntry = await this._trustchain.findKeyPublish(resourceId);
    if (keyPublishEntry) {
      const { _keyStore, _groupStore, _sharedKeystore } = this._storage;
      return processKeyPublish(_keyStore, this._userAccessor, _groupStore, _sharedKeystore, keyPublishEntry);
    }
    return null;
  }

  async share(resourceIds: Array<b64string>, shareWith: Array<string>): Promise<void> {
    const { users, groups } = await this.processShareWith(shareWith, false);

    // nothing to return, just wait for the promises to finish
    const keys = await Promise.all(resourceIds.map(async (b64ResourceId) => {
      const resourceId = utils.fromBase64(b64ResourceId);
      const key = await this._findResourceKey(resourceId);
      if (!key)
        throw new ResourceNotFound(resourceId);
      return { resourceId, key };
    }));
    return keyPublish(this._client, this._storage.keyStore, keys, users, groups);
  }
}
