// @flow

import { tcrypto, type Key } from '@tanker/crypto';

import GroupManager from '../../Groups/Manager';
import LocalUser from '../../Session/LocalUser';

import { DecryptionFailed, InternalError } from '../../errors';

import { type KeyPublish, isKeyPublishToUser, isKeyPublishToUserGroup, isKeyPublishToProvisionalUser } from './keyPublish';

export class KeyDecryptor {
  _localUser: LocalUser;
  _groupManager: GroupManager;

  constructor(
    localUser: LocalUser,
    groupManager: GroupManager
  ) {
    this._localUser = localUser;
    this._groupManager = groupManager;
  }

  async decryptResourceKeyPublishedToUser(keyPublishEntry: KeyPublish): Promise<Key> {
    const userKey = this._localUser.findUserKey(keyPublishEntry.recipient);
    if (!userKey)
      throw new DecryptionFailed({ message: 'User key not found' });
    return tcrypto.sealDecrypt(keyPublishEntry.key, userKey);
  }

  async decryptResourceKeyPublishedToGroup(keyPublishEntry: KeyPublish): Promise<Key> {
    const encryptionKeyPair = await this._groupManager.getGroupEncryptionKeyPair(keyPublishEntry.recipient);
    if (!encryptionKeyPair)
      throw new DecryptionFailed({ message: 'Group not found' });
    return tcrypto.sealDecrypt(keyPublishEntry.key, encryptionKeyPair);
  }

  async decryptResourceKeyPublishedToProvisionalIdentity(keyPublishEntry: KeyPublish): Promise<Key> {
    const keys = this._localUser.findProvisionalUserKey(keyPublishEntry.recipient);
    if (!keys)
      throw new DecryptionFailed({ message: 'Provisional user key not found' });
    const d1 = tcrypto.sealDecrypt(keyPublishEntry.key, keys.tankerEncryptionKeyPair);
    const d2 = tcrypto.sealDecrypt(d1, keys.appEncryptionKeyPair);
    return d2;
  }

  async keyFromKeyPublish(keyPublishEntry: KeyPublish): Promise<Key> {
    if (isKeyPublishToUser(keyPublishEntry.nature)) {
      return this.decryptResourceKeyPublishedToUser(keyPublishEntry);
    }
    if (isKeyPublishToUserGroup(keyPublishEntry.nature)) {
      return this.decryptResourceKeyPublishedToGroup(keyPublishEntry);
    }
    if (isKeyPublishToProvisionalUser(keyPublishEntry.nature)) {
      return this.decryptResourceKeyPublishedToProvisionalIdentity(keyPublishEntry);
    }
    throw new InternalError(`Invalid nature for key publish: ${keyPublishEntry.nature}`);
  }
}
