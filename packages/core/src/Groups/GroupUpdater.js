// @flow
import { tcrypto, utils } from '@tanker/crypto';

import GroupStore from './GroupStore';
import Keystore from '../Session/Keystore';
import { type ProvisionalUserKeyPairs } from '../Session/KeySafe';

import { type VerifiedUserGroup } from '../Trustchain/UnverifiedStore/UserGroupsUnverifiedStore';
import {
  type GroupEncryptedKey,
  type ProvisionalGroupEncryptedKeyV2,
  type UserGroupCreationRecord,
  type UserGroupAdditionRecord,
} from '../Blocks/payloads';
import { NATURE_KIND, natureKind } from '../Blocks/Nature';

function findMyUserKeys(groupKeys: $ReadOnlyArray<GroupEncryptedKey>, keystore: Keystore): ?Object {
  for (const gek of groupKeys) {
    const correspondingPair = keystore.findUserKey(gek.public_user_encryption_key);
    if (correspondingPair)
      return {
        userKeyPair: correspondingPair,
        groupEncryptedKey: gek.encrypted_group_private_encryption_key,
      };
  }
  return null;
}

function findMyProvisionalKeys(groupKeys: $ReadOnlyArray<ProvisionalGroupEncryptedKeyV2>, keystore: Keystore): ?Object {
  for (const gek of groupKeys) {
    const id = utils.toBase64(utils.concatArrays(gek.app_provisional_user_public_signature_key, gek.tanker_provisional_user_public_signature_key));
    const correspondingPair = keystore.findProvisionalKey(id);
    if (correspondingPair)
      return {
        provisionalKeyPair: correspondingPair,
        groupEncryptedKey: gek.encrypted_group_private_encryption_key,
      };
  }
  return null;
}

function provisionalUnseal(ciphertext: Uint8Array, keys: ProvisionalUserKeyPairs): Uint8Array {
  const intermediate = tcrypto.sealDecrypt(ciphertext, keys.tankerEncryptionKeyPair);
  return tcrypto.sealDecrypt(intermediate, keys.appEncryptionKeyPair);
}

export default class GroupUpdater {
  _groupStore: GroupStore;
  _keystore: Keystore;

  constructor(groupStore: GroupStore, keystore: Keystore) {
    this._groupStore = groupStore;
    this._keystore = keystore;
  }

  _applyUserGroupCreation = async (entry: VerifiedUserGroup) => {
    const userGroupCreation: UserGroupCreationRecord = (entry: any);
    let groupPrivateEncryptionKey;

    const userKeys = findMyUserKeys(userGroupCreation.encrypted_group_private_encryption_keys_for_users, this._keystore);
    if (userKeys) {
      groupPrivateEncryptionKey = tcrypto.sealDecrypt(userKeys.groupEncryptedKey, userKeys.userKeyPair);
    } else if (userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users) {
      const provisionalKeys = findMyProvisionalKeys(userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users, this._keystore);
      if (provisionalKeys)
        groupPrivateEncryptionKey = provisionalUnseal(provisionalKeys.groupEncryptedKey, provisionalKeys.provisionalKeyPair);
    }

    if (groupPrivateEncryptionKey) {
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
    } else {
      await this._groupStore.putExternal({
        groupId: userGroupCreation.public_signature_key,
        publicSignatureKey: userGroupCreation.public_signature_key,
        publicEncryptionKey: userGroupCreation.public_encryption_key,
        encryptedPrivateSignatureKey: userGroupCreation.encrypted_group_private_signature_key,
        provisionalEncryptionKeys: (userGroupCreation.encrypted_group_private_encryption_keys_for_provisional_users || []).map(p => ({
          appPublicSignatureKey: p.app_provisional_user_public_signature_key,
          tankerPublicSignatureKey: p.tanker_provisional_user_public_signature_key,
          encryptedGroupPrivateEncryptionKey: p.encrypted_group_private_encryption_key,
        })),
        lastGroupBlock: entry.hash,
        index: entry.index,
      });
    }
  }

  _applyUserGroupAddition = async (entry: VerifiedUserGroup) => {
    const userGroupAddition: UserGroupAdditionRecord = (entry: any);
    let groupPrivateEncryptionKey;

    const previousGroup = await this._groupStore.findExternal({ groupId: userGroupAddition.group_id });
    if (!previousGroup)
      throw new Error(`Assertion error: can't find group ${utils.toBase64(userGroupAddition.group_id)}`);

    await this._groupStore.updateLastGroupBlock({ groupId: userGroupAddition.group_id, currentLastGroupBlock: entry.hash, currentLastGroupIndex: entry.index });

    // I am already member of this group, ignore
    if (!previousGroup.encryptedPrivateSignatureKey)
      return;

    const userKeys = findMyUserKeys(userGroupAddition.encrypted_group_private_encryption_keys_for_users, this._keystore);
    if (userKeys) {
      groupPrivateEncryptionKey = tcrypto.sealDecrypt(userKeys.groupEncryptedKey, userKeys.userKeyPair);
    } else if (userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users) {
      const provisionalKeys = findMyProvisionalKeys(userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users, this._keystore);
      if (provisionalKeys)
        groupPrivateEncryptionKey = provisionalUnseal(provisionalKeys.groupEncryptedKey, provisionalKeys.provisionalKeyPair);
    }

    if (!groupPrivateEncryptionKey) {
      await this._groupStore.updateProvisionalEncryptionKeys({
        groupId: previousGroup.groupId,
        provisionalEncryptionKeys: (userGroupAddition.encrypted_group_private_encryption_keys_for_provisional_users || []).map(p => ({
          appPublicSignatureKey: p.app_provisional_user_public_signature_key,
          tankerPublicSignatureKey: p.tanker_provisional_user_public_signature_key,
          encryptedGroupPrivateEncryptionKey: p.encrypted_group_private_encryption_key,
        })),
      });
      return;
    }

    // I've just been added to this group, lets keep the private keys
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

  applyEntry = async (entry: VerifiedUserGroup) => {
    if (natureKind(entry.nature) === NATURE_KIND.user_group_creation)
      await this._applyUserGroupCreation(entry);
    else if (natureKind(entry.nature) === NATURE_KIND.user_group_addition)
      await this._applyUserGroupAddition(entry);
    else
      throw new Error(`unsupported group update block nature: ${entry.nature}`);
  }

  applyProvisionalIdentityClaim = async (provisionalUserKeys: ProvisionalUserKeyPairs) => {
    const provisionalGroups = await this._groupStore.findExternalsByProvisionalId({ id: provisionalUserKeys.id });

    const groups = provisionalGroups.map(g => {
      const myKeys = g.provisionalEncryptionKeys.filter(provisionalKey => {
        const provisionalKeyId = utils.toBase64(utils.concatArrays(provisionalKey.appPublicSignatureKey, provisionalKey.tankerPublicSignatureKey));
        return provisionalKeyId === provisionalUserKeys.id;
      });
      if (myKeys.length !== 1)
        throw new Error('assertion error: findExternals returned groups without my keys');
      const privateEncryptionKey = provisionalUnseal(myKeys[0].encryptedGroupPrivateEncryptionKey, provisionalUserKeys);
      return {
        groupId: g.groupId,
        signatureKeyPair: {
          publicKey: g.publicSignatureKey,
          privateKey: tcrypto.sealDecrypt(g.encryptedPrivateSignatureKey, { publicKey: g.publicEncryptionKey, privateKey: privateEncryptionKey }),
        },
        encryptionKeyPair: {
          publicKey: g.publicEncryptionKey,
          privateKey: privateEncryptionKey,
        },
        lastGroupBlock: g.lastGroupBlock,
        index: g.index,
      };
    });

    await this._groupStore.bulkPut(groups);
  }
}
