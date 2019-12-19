// @flow

import { tcrypto, type Key } from '@tanker/crypto';
import { DecryptionFailed, InternalError } from '@tanker/errors';

import GroupManager from '../../Groups/Manager';
import LocalUser from '../../Session/LocalUser/LocalUser';
import ProvisionalIdentityManager from '../../Session/ProvisionalIdentity/ProvisionalIdentityManager';

import { type KeyPublishEntry, isKeyPublishToUser, isKeyPublishToUserGroup, isKeyPublishToProvisionalUser } from './keyPublish';

export class KeyDecryptor {
  _localUser: LocalUser;
  _groupManager: GroupManager;
  _provisionalIdentityManager: ProvisionalIdentityManager;

  constructor(
    localUser: LocalUser,
    groupManager: GroupManager,
    provisionalIdentityManager: ProvisionalIdentityManager
  ) {
    this._localUser = localUser;
    this._groupManager = groupManager;
    this._provisionalIdentityManager = provisionalIdentityManager;
  }

  async decryptResourceKeyPublishedToUser(keyPublishEntry: KeyPublishEntry): Promise<Key> {
    if (!keyPublishEntry.recipient) {
      throw new InternalError('Assertion error: key publish without recipient');
    }
    const userKey = this._localUser.findUserKey(keyPublishEntry.recipient);
    if (!userKey)
      throw new DecryptionFailed({ message: 'User key not found' });
    return tcrypto.sealDecrypt(keyPublishEntry.key, userKey);
  }

  async decryptResourceKeyPublishedToGroup(keyPublishEntry: KeyPublishEntry): Promise<Key> {
    if (!keyPublishEntry.recipient) {
      throw new InternalError('Assertion error: key publish without recipient');
    }
    const encryptionKeyPair = await this._groupManager.getGroupEncryptionKeyPair(keyPublishEntry.recipient);
    if (!encryptionKeyPair)
      throw new DecryptionFailed({ message: 'Group not found' });
    return tcrypto.sealDecrypt(keyPublishEntry.key, encryptionKeyPair);
  }

  async decryptResourceKeyPublishedToProvisionalIdentity(keyPublishEntry: KeyPublishEntry): Promise<Key> {
    if (!keyPublishEntry.recipientAppPublicKey || !keyPublishEntry.recipientTankerPublicKey) {
      throw new InternalError('Assertion error: key publish without recipient');
    }
    const keys = await this._provisionalIdentityManager.getPrivateProvisionalKeys(keyPublishEntry.recipientAppPublicKey, keyPublishEntry.recipientTankerPublicKey);
    if (!keys)
      throw new DecryptionFailed({ message: 'Provisional user key not found' });
    const d1 = tcrypto.sealDecrypt(keyPublishEntry.key, keys.tankerEncryptionKeyPair);
    const d2 = tcrypto.sealDecrypt(d1, keys.appEncryptionKeyPair);
    return d2;
  }

  async keyFromKeyPublish(keyPublishEntry: KeyPublishEntry): Promise<Key> {
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
