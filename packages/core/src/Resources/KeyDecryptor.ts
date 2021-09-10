import type { Key } from '@tanker/crypto';
import { tcrypto } from '@tanker/crypto';
import { DecryptionFailed, InternalError } from '@tanker/errors';

import type GroupManager from '../Groups/Manager';
import type LocalUserManager from '../LocalUser/Manager';
import type ProvisionalIdentityManager from '../ProvisionalIdentity/Manager';

import type { KeyPublishEntry } from './Serialize';
import { isKeyPublishToUser, isKeyPublishToUserGroup, isKeyPublishToProvisionalUser } from './Serialize';

export class KeyDecryptor {
  _localUserManager: LocalUserManager;
  _groupManager: GroupManager;
  _provisionalIdentityManager: ProvisionalIdentityManager;

  constructor(
    localUserManager: LocalUserManager,
    groupManager: GroupManager,
    provisionalIdentityManager: ProvisionalIdentityManager,
  ) {
    this._localUserManager = localUserManager;
    this._groupManager = groupManager;
    this._provisionalIdentityManager = provisionalIdentityManager;
  }

  async decryptResourceKeyPublishedToUser(keyPublishEntry: KeyPublishEntry): Promise<Key> {
    if (!('recipient' in keyPublishEntry)) {
      throw new InternalError('Assertion error: key publish without recipient');
    }
    const userKey = await this._localUserManager.findUserKey(keyPublishEntry.recipient);
    if (!userKey)
      throw new DecryptionFailed({ message: 'User key not found' });
    return tcrypto.sealDecrypt(keyPublishEntry.key, userKey);
  }

  async decryptResourceKeyPublishedToGroup(keyPublishEntry: KeyPublishEntry): Promise<Key> {
    if (!('recipient' in keyPublishEntry)) {
      throw new InternalError('Assertion error: key publish without recipient');
    }
    const encryptionKeyPair = await this._groupManager.getGroupEncryptionKeyPair(keyPublishEntry.recipient);
    if (!encryptionKeyPair)
      throw new DecryptionFailed({ message: 'Group not found' });
    return tcrypto.sealDecrypt(keyPublishEntry.key, encryptionKeyPair);
  }

  async decryptResourceKeyPublishedToProvisionalIdentity(keyPublishEntry: KeyPublishEntry): Promise<Key> {
    if (!('recipientAppPublicKey' in keyPublishEntry && 'recipientTankerPublicKey' in keyPublishEntry)) {
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
