// @flow
import { tcrypto, utils } from '@tanker/crypto';

import GroupStore from './GroupStore';
import Keystore from '../Session/Keystore';

import { type VerifiedUserGroupEntry } from '../UnverifiedStore/UserGroupsUnverifiedStore';
import { NATURE, type GroupEncryptedKey, type UserGroupCreationRecord, type UserGroupAdditionRecord } from '../Blocks/payloads';

// have you looked in your pocket?
function findMyKeys(groupKeys: Array<GroupEncryptedKey>, keystore: Keystore): ?Object {
  for (const gek of groupKeys) {
    const correspondingPair = keystore.findUserKey(gek.public_user_encryption_key);
    if (correspondingPair)
      return {
        userKeyPair: correspondingPair,
        groupEncryptedKey: gek,
      };
  }
  return null;
}

export default class GroupUpdater {
  _groupStore: GroupStore;
  _keystore: Keystore;

  constructor(groupStore: GroupStore, keystore: Keystore) {
    this._groupStore = groupStore;
    this._keystore = keystore;
  }

  _applyUserGroupCreation = async (entry: VerifiedUserGroupEntry) => {
    const userGroupCreation: UserGroupCreationRecord = (entry: any);

    const myKeys = findMyKeys(userGroupCreation.encrypted_group_private_encryption_keys_for_users, this._keystore);
    if (!myKeys) {
      await this._groupStore.putExternal({
        groupId: userGroupCreation.public_signature_key,
        publicSignatureKey: userGroupCreation.public_signature_key,
        publicEncryptionKey: userGroupCreation.public_encryption_key,
        encryptedPrivateSignatureKey: userGroupCreation.encrypted_group_private_signature_key,
        lastGroupBlock: entry.hash,
        index: entry.index,
      });
    } else {
      const groupPrivateEncryptionKey = tcrypto.sealDecrypt(myKeys.groupEncryptedKey.encrypted_group_private_encryption_key, myKeys.userKeyPair);
      const groupPrivateSignatureKey = tcrypto.sealDecrypt(userGroupCreation.encrypted_group_private_signature_key, { publicKey: userGroupCreation.public_encryption_key, privateKey: groupPrivateEncryptionKey });
      await this._groupStore.put({
        groupId: userGroupCreation.public_signature_key,
        signatureKeyPair: {
          publicKey: userGroupCreation.public_signature_key,
          privateKey: groupPrivateSignatureKey,
        },
        encryptionKeyPair: {
          publicKey: userGroupCreation.public_encryption_key,
          privateKey: groupPrivateEncryptionKey,
        },
        lastGroupBlock: entry.hash,
        index: entry.index,
      });
    }
  }

  _applyUserGroupAddition = async (entry: VerifiedUserGroupEntry) => {
    const userGroupAddition: UserGroupAdditionRecord = (entry: any);

    const previousGroup = await this._groupStore.findExternal({ groupId: userGroupAddition.group_id });
    if (!previousGroup)
      throw new Error(`Assertion error: can't find group ${utils.toBase64(userGroupAddition.group_id)}`);

    await this._groupStore.updateLastGroupBlock({ groupId: userGroupAddition.group_id, currentLastGroupBlock: entry.hash });

    const myKeys = findMyKeys(userGroupAddition.encrypted_group_private_encryption_keys_for_users, this._keystore);
    if (!myKeys)
      return;
    // I am already member of this group, ignore
    if (!previousGroup.encryptedPrivateSignatureKey)
      return;

    // I've just been added to this group, lets keep the private keys
    const groupPrivateEncryptionKey = tcrypto.sealDecrypt(myKeys.groupEncryptedKey.encrypted_group_private_encryption_key, myKeys.userKeyPair);
    const groupPrivateSignatureKey = tcrypto.sealDecrypt(previousGroup.encryptedPrivateSignatureKey, { publicKey: previousGroup.publicEncryptionKey, privateKey: groupPrivateEncryptionKey });
    await this._groupStore.put({
      groupId: previousGroup.groupId,
      signatureKeyPair: {
        publicKey: previousGroup.publicSignatureKey,
        privateKey: groupPrivateSignatureKey,
      },
      encryptionKeyPair: {
        publicKey: previousGroup.publicEncryptionKey,
        privateKey: groupPrivateEncryptionKey,
      },
      lastGroupBlock: entry.hash,
      index: entry.index,
    });
  }

  applyEntry = async (entry: VerifiedUserGroupEntry) => {
    if (entry.nature === NATURE.user_group_creation)
      await this._applyUserGroupCreation(entry);
    else if (entry.nature === NATURE.user_group_addition)
      await this._applyUserGroupAddition(entry);
    else
      throw new Error(`unsupported group update block nature: ${entry.nature}`);
  }
}
