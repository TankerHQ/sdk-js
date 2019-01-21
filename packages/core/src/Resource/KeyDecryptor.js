// @flow

import { tcrypto, utils, type Key } from '@tanker/crypto';

import { isKeyPublishToDevice, isKeyPublishToUser, isKeyPublishToUserGroup, isKeyPublishToInvitee } from '../Blocks/Nature';
import GroupStore from '../Groups/GroupStore';
import LocalUser from '../Session/LocalUser';
import UserAccessor from '../Users/UserAccessor';
import { type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';

export class KeyDecryptor {
  _localUser: LocalUser;
  _userAccessor: UserAccessor;
  _groupStore: GroupStore;

  constructor(
    localUser: LocalUser,
    userAccessor: UserAccessor,
    groupStore: GroupStore
  ) {
    this._localUser = localUser;
    this._userAccessor = userAccessor;
    this._groupStore = groupStore;
  }

  async decryptResourceKeyPublishedToDevice(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    if (!this._localUser.deviceId || !utils.equalArray(keyPublishEntry.recipient, this._localUser.deviceId)) {
      return null;
    }
    const authorKey = await this._userAccessor.getDevicePublicEncryptionKey(keyPublishEntry.author);
    if (!authorKey)
      throw new Error('Assertion error: Key publish is verified, but can\'t find author\'s key!');
    return tcrypto.asymDecrypt(keyPublishEntry.key, authorKey, this._localUser.privateEncryptionKey);
  }

  async decryptResourceKeyPublishedToUser(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    const userKey = this._localUser.findUserKey(keyPublishEntry.recipient);
    if (!userKey)
      return null;
    return tcrypto.sealDecrypt(keyPublishEntry.key, userKey);
  }

  async decryptResourceKeyPublishedToGroup(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    const group = await this._groupStore.findFull({ groupPublicEncryptionKey: keyPublishEntry.recipient });
    if (!group)
      return null;
    return tcrypto.sealDecrypt(keyPublishEntry.key, group.encryptionKeyPair);
  }

  async decryptResourceKeyPublishedToInvitee(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    const keys = this._localUser.findInviteeKey(keyPublishEntry.recipient);
    if (!keys)
      return null;
    const d1 = tcrypto.sealDecrypt(keyPublishEntry.key, keys.tankerEncryptionKeyPair);
    const d2 = tcrypto.sealDecrypt(d1, keys.appEncryptionKeyPair);
    return d2;
  }

  async keyFromKeyPublish(keyPublishEntry: VerifiedKeyPublish): Promise<?Key> {
    let resourceKey: Promise<?Key>;

    try {
      if (isKeyPublishToDevice(keyPublishEntry.nature)) {
        resourceKey = this.decryptResourceKeyPublishedToDevice(keyPublishEntry);
      } else if (isKeyPublishToUser(keyPublishEntry.nature)) {
        resourceKey = this.decryptResourceKeyPublishedToUser(keyPublishEntry);
      } else if (isKeyPublishToUserGroup(keyPublishEntry.nature)) {
        resourceKey = this.decryptResourceKeyPublishedToGroup(keyPublishEntry);
      } else if (isKeyPublishToInvitee(keyPublishEntry.nature)) {
        console.log('#####');
        resourceKey = this.decryptResourceKeyPublishedToInvitee(keyPublishEntry);
      } else {
        resourceKey = Promise.resolve(null);
      }
    } catch (err) {
      const b64resourceId = utils.toBase64(keyPublishEntry.resourceId);
      console.error(`Cannot decrypt key of resource "${b64resourceId}":`, err);
      throw err;
    }

    return resourceKey;
  }

  deviceReady(): bool {
    return !!this._localUser.deviceId;
  }
}
