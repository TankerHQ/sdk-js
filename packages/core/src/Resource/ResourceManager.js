// @flow

import varint from 'varint';

import { tcrypto, random, aead, generichash, type Key } from '@tanker/crypto';
import { ResourceNotFound, InvalidEncryptionFormat } from '../errors';
import Trustchain from '../Trustchain/Trustchain';
import { type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import { KeyDecryptor } from './KeyDecryptor';
import ResourceStore from './ResourceStore';

export const currentSimpleVersion = 2;
export const currentStreamVersion = 3;

export type Resource = {
  key: Uint8Array,
  resourceId: Uint8Array,
  encryptedData: Uint8Array,
  version: number
}

export type ResourceIdKeyPair = {
  key: Uint8Array,
  resourceId: Uint8Array
}

export function getResourceId(serializedData: Uint8Array): Uint8Array {
  const version = varint.decode(serializedData);
  const binaryData = serializedData.subarray(varint.decode.bytes);
  switch (version) {
    case 1:
    case 2:
      return aead.extractResourceId(binaryData);
    case 3:
      return binaryData.subarray(0, tcrypto.MAC_SIZE);
    default:
      throw new InvalidEncryptionFormat(`unhandled format version in getResourceId: '${version}'`);
  }
}

export class ResourceManager {
  _resourceStore: ResourceStore;
  _trustchain: Trustchain;
  _keyDecryptor: KeyDecryptor;

  constructor(
    resourceStore: ResourceStore,
    trustchain: Trustchain,
    keyDecryptor: KeyDecryptor
  ) {
    this._resourceStore = resourceStore;
    this._trustchain = trustchain;
    this._keyDecryptor = keyDecryptor;
  }

  static async makeSimpleResource(plain: Uint8Array): Promise<Resource> {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const buffer = await aead.encryptAEADv2(key, plain);
    const resourceId = aead.extractResourceId(buffer);
    return { key, resourceId, encryptedData: buffer, version: currentSimpleVersion };
  }

  static makeStreamResource(): ResourceIdKeyPair {
    const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
    const resourceId = generichash(key, tcrypto.MAC_SIZE);

    return { key, resourceId };
  }

  async findKeyFromResourceId(resourceId: Uint8Array, retry?: bool): Promise<Key> {
    const key = await this._resourceStore.findResourceKey(resourceId);
    if (key)
      return key;
    const keyPublishEntry = await this._trustchain.findKeyPublish(resourceId);
    if (keyPublishEntry) {
      const processedKey = await this.extractAndSaveResourceKey(keyPublishEntry);
      if (processedKey) {
        return processedKey;
      }
    } else if (retry) {
      await this._trustchain.sync();
      return this.findKeyFromResourceId(resourceId);
    }
    throw new ResourceNotFound(resourceId);
  }

  async extractAndSaveResourceKey(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    // ignore this block, our device doesn't exist yet so there's no way this resourceKey publish is for us
    if (!this._keyDecryptor.deviceReady())
      return null;

    const resourceKey = await this._keyDecryptor.keyFromKeyPublish(keyPublishEntry);
    if (resourceKey) {
      await this.saveResourceKey(keyPublishEntry.resourceId, resourceKey);
    }

    return resourceKey;
  }

  async saveResourceKey(resourceId: Uint8Array, key: Uint8Array): Promise<void> {
    return this._resourceStore.saveResourceKey(resourceId, key);
  }
}
