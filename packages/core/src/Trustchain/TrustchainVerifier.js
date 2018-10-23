// @flow
import { Mutex } from 'async-mutex';
import find from 'array-find';
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidBlockError } from '../errors';
import type { Entry, UnverifiedEntry } from '../Blocks/entries';
import { findIndex, compareSameSizeUint8Arrays } from '../utils';
import { getLastUserPublicKey, type User, type Device } from '../Users/UserStore';
import GroupUpdater from '../Groups/GroupUpdater';
import { type ExternalGroup } from '../Groups/types';
import { getUserGroupCreationBlockSignData, getUserGroupAdditionBlockSignData } from '../Blocks/BlockGenerator';
import { type UnverifiedKeyPublish, type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import type { UnverifiedDeviceCreation, VerifiedDeviceCreation, UnverifiedDeviceRevocation, VerifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { type UnverifiedUserGroupEntry, type VerifiedUserGroupEntry } from '../UnverifiedStore/UserGroupsUnverifiedStore';

import {
  type UserDeviceRecord,
  type UserGroupCreationRecord,
  type UserGroupAdditionRecord,
  NATURE,
  NATURE_KIND,
  natureKind,
  isDeviceCreation,
  isDeviceRevocation,
  isTrustchainCreation,
  isKeyPublishToDevice,
  isKeyPublishToUser,
  isKeyPublishToUserGroup,
} from '../Blocks/payloads';

import Storage from '../Session/Storage';
import { rootEntryAuthor } from '../Trustchain/TrustchainStore';

export default class TrustchainVerifier {
  _verifyLock: Mutex = new Mutex();
  _trustchainId: Uint8Array;
  _storage: Storage;
  _groupUpdater: GroupUpdater;


  constructor(trustchainId: Uint8Array, storage: Storage, groupUpdater: GroupUpdater) {
    this._storage = storage;
    this._trustchainId = trustchainId;
    this._groupUpdater = groupUpdater;
  }

  _verifyTrustchainCreation(entry: UnverifiedEntry) {
    if (!isTrustchainCreation(entry.nature))
      throw new InvalidBlockError('invalid_nature', 'invalid nature for trustchain creation', { entry });

    if (!utils.equalArray(entry.author, rootEntryAuthor))
      throw new InvalidBlockError('invalid_author_for_trustchain_creation', 'author of trustchain_creation must be 0', { entry });

    if (!utils.isNullArray(entry.signature))
      throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry });

    if (!utils.equalArray(entry.hash, this._trustchainId))
      throw new InvalidBlockError('invalid_root_block', 'the root block does not correspond to this trustchain', { entry, trustchainId: this._trustchainId });
  }

  _verifyDeviceCreation(entry: UnverifiedDeviceCreation, authorUser: ?User, authorDevice: ?Device, authorKey: Uint8Array, user: ?User) {
    if (!utils.isNullArray(entry.last_reset))
      throw new InvalidBlockError('invalid_last_reset', 'last_reset is not null', { entry });

    const userPublicKey = user ? getLastUserPublicKey(user) : null;
    if (userPublicKey && entry.nature !== NATURE.device_creation_v3)
      throw new InvalidBlockError('forbidden', 'device creation version mismatch', { entry, authorDevice });

    if (!utils.isNullArray(entry.last_reset))
      throw new InvalidBlockError('invalid_last_reset', 'last_reset is not null', { entry });

    const delegationBuffer = utils.concatArrays(entry.ephemeral_public_signature_key, entry.user_id);
    if (!tcrypto.verifySignature(delegationBuffer, entry.delegation_signature, authorKey))
      throw new InvalidBlockError('invalid_delegation_signature', 'delegation signature is invalid', { entry, authorDevice });

    if (!tcrypto.verifySignature(entry.hash, entry.signature, entry.ephemeral_public_signature_key))
      throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, authorDevice });

    if (authorDevice) {
      if (entry.nature === NATURE.device_creation_v3 && userPublicKey && entry.user_key_pair
        && !utils.equalArray(entry.user_key_pair.public_encryption_key, userPublicKey))
        throw new InvalidBlockError('invalid_public_user_key', 'public_user_key is different than the author\'s one', { entry, authorDevice });

      if (!authorUser)
        throw new Error('Assertion error: We have an author device, but no author user!?');
      if (utils.toBase64(entry.user_id) !== authorUser.userId)
        throw new InvalidBlockError('forbidden', 'the author is not authorized to create a device for this user', { entry, authorDevice });

      if (entry.is_server_device !== authorDevice.isServerDevice) {
        throw new InvalidBlockError('invalid_author_type', 'device type mismatch', { entry, authorDevice });
      }
    } else {
      if (!user || user.devices.length === 0)
        return;

      // If we're already verified, then it's not an error
      const entryDeviceId = utils.toBase64(entry.hash);
      if (!user.devices.some(device => device.deviceId === entryDeviceId))
        throw new InvalidBlockError('forbidden', 'the user already has a device, this can\'t be the first device', { entry });
    }
  }

  async _verifyKeyPublishToDevice(entry: UnverifiedKeyPublish, author: Device): Promise<void> {
    const recipient = await this._storage.userStore.findDevice({ hashedDeviceId: entry.recipient });
    if (!recipient)
      throw new InvalidBlockError('invalid_recipient', 'recipient is not a valid device', { entry, author });
    const devToUser = await this._storage.userStore.findDeviceToUser({ hashedDeviceId: entry.recipient });
    if (!devToUser)
      throw new InvalidBlockError('invalid_recipient', 'could not find recipient device-to-user', { entry, author, recipient });
    const user = await this._storage.userStore.findUser({ hashedUserId: utils.fromBase64(devToUser.userId) });
    if (!user)
      throw new InvalidBlockError('invalid_recipient', 'could not find recipient user', { entry, author, recipient });
    for (const userKey of user.userPublicKeys)
      if (userKey.index < entry.index)
        throw new InvalidBlockError('version_mismatch', 'cannot send a key publish V1 to a user V3', { entry, author, recipient });
  }

  async _verifyKeyPublishToUser(entry: UnverifiedKeyPublish, author: Device) {
    const recipient = await this._storage.userStore.findUserByUserPublicKey({ hashedUserPublicKey: entry.recipient });
    if (!recipient)
      throw new InvalidBlockError('invalid_recipient', 'recipient is not a valid user', { entry, author });

    const indexUserKey = find(recipient.userPublicKeys, userPublicKey => utils.equalArray(userPublicKey.userPublicKey, entry.recipient));

    if (!indexUserKey || indexUserKey.index > entry.index)
      throw new InvalidBlockError('invalid_user_public_key', 'user public key has been superseeded', { entry, author });

    const futureUserKey = find(recipient.userPublicKeys, userPublicKey => userPublicKey.index > indexUserKey.index);

    if (futureUserKey && entry.index > futureUserKey.index)
      throw new InvalidBlockError('invalid_user_public_key', 'user public key has been superseeded', { entry, author });
  }

  async _verifyKeyPublishToUserGroup(entry: UnverifiedKeyPublish, author: Device) {
    const group = await this._storage.groupStore.findExternal({ groupPublicEncryptionKey: entry.recipient });
    if (!group)
      throw new InvalidBlockError('invalid_recipient', 'recipient is not a valid group', { entry, author });
  }

  async _verifyKeyPublish(entry: UnverifiedKeyPublish, author: Device) {
    if (!tcrypto.verifySignature(entry.hash, entry.signature, author.devicePublicSignatureKey))
      throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, author });

    if (isKeyPublishToDevice(entry.nature)) {
      return this._verifyKeyPublishToDevice(entry, author);
    } else if (isKeyPublishToUser(entry.nature)) {
      return this._verifyKeyPublishToUser(entry, author);
    } else if (isKeyPublishToUserGroup(entry.nature)) {
      return this._verifyKeyPublishToUserGroup(entry, author);
    }
  }

  _verifyUserGroupCreation(entry: UnverifiedUserGroupEntry, author: Device, existingGroup: ?ExternalGroup): VerifiedUserGroupEntry {
    const currentPayload: UserGroupCreationRecord = (entry: any);

    if (!tcrypto.verifySignature(entry.hash, entry.signature, author.devicePublicSignatureKey))
      throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, author });

    if (existingGroup && !utils.equalArray(existingGroup.publicEncryptionKey, currentPayload.public_encryption_key)) {
      throw new InvalidBlockError('group_already_exists', 'a group with the same public signature key already exists', { entry, author });
    }

    const selfSigBuffer = getUserGroupCreationBlockSignData(currentPayload);
    if (!tcrypto.verifySignature(selfSigBuffer, currentPayload.self_signature, currentPayload.public_signature_key))
      throw new InvalidBlockError('invalid_self_signature', 'self signature is invalid', { entry, author });

    return (entry: VerifiedUserGroupEntry);
  }

  _verifyUserGroupAddition(entry: UnverifiedUserGroupEntry, author: Device, currentGroup: ?ExternalGroup): VerifiedUserGroupEntry {
    const currentPayload: UserGroupAdditionRecord = (entry: any);

    if (!tcrypto.verifySignature(entry.hash, entry.signature, author.devicePublicSignatureKey))
      throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, author });

    if (!currentGroup)
      throw new InvalidBlockError('invalid_group_id', 'cannot find group id', { entry, author });

    if (!utils.equalArray(currentPayload.previous_group_block, currentGroup.lastGroupBlock))
      throw new InvalidBlockError('invalid_previous_group_block', 'previous group block does not match for this group id', { entry, author, currentGroup });

    const selfSigBuffer = getUserGroupAdditionBlockSignData(currentPayload);
    if (!tcrypto.verifySignature(selfSigBuffer, currentPayload.self_signature_with_current_key, currentGroup.publicSignatureKey))
      throw new InvalidBlockError('invalid_self_signature', 'self signature is invalid', { entry, author });

    return (entry: VerifiedUserGroupEntry);
  }

  _verifyDeviceRevocation(entry: UnverifiedDeviceRevocation, authorUserId: b64string, authorKey: Uint8Array, targetUser: ?User) {
    if (!tcrypto.verifySignature(entry.hash, entry.signature, authorKey))
      throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, authorKey });

    if (!targetUser)
      throw new InvalidBlockError('invalid_revoked_user', 'could not find revoked user in user store', { entry });
    const revokedDevice = find(targetUser.devices, d => utils.equalArray(utils.fromBase64(d.deviceId), entry.device_id));
    if (!revokedDevice)
      throw new InvalidBlockError('invalid_revoked_device', 'can\'t find target of device revocation block', { entry });
    if (revokedDevice.revokedAt < entry.index)
      throw new InvalidBlockError('device_already_revoked', 'target of device_revocation block is already revoked', { entry, revokedDevice });

    if (authorUserId !== targetUser.userId)
      throw new InvalidBlockError('forbidden', 'Device Recovation Block author does not match revoked device user ID', { entry, authorUserId });

    if (entry.nature === NATURE.device_revocation_v1) {
      if (targetUser.userPublicKeys.length !== 0)
        throw new InvalidBlockError('invalid_revocation_version', 'cannot use a device revocation v1 if the target has a user key', { entry, targetUser });
    } else {
      const newKeys = entry.user_keys;
      if (!newKeys)
        throw new InvalidBlockError('missing_user_keys', 'missing user keys', { entry });
      const userPublicKey = getLastUserPublicKey(targetUser);
      if (userPublicKey && !utils.equalArray(newKeys.previous_public_encryption_key, userPublicKey))
        throw new InvalidBlockError('invalid_previous_key', 'previous public user encryption key does not match', { entry, targetUser });

      const activeDevices = targetUser.devices.filter(d => d.revokedAt > entry.index && d.deviceId !== utils.toBase64(entry.device_id));
      if (activeDevices.length !== newKeys.private_keys.length)
        throw new InvalidBlockError('invalid_new_key', 'device number mismatch', { entry, targetUser, activeDeviceCount: activeDevices.length, userKeysCount: newKeys.private_keys.length });
      for (const device of activeDevices) {
        const devId = utils.fromBase64(device.deviceId);
        if (findIndex(newKeys.private_keys, k => utils.equalArray(k.recipient, devId)) === -1)
          throw new InvalidBlockError('invalid_new_key', 'missing encrypted private key for an active device', { entry, targetUser });
      }
    }
  }

  // Returns a map from entry hash to author entry, if the author could be found, verified, and was not revoked at the given index
  async _unlockedGetVerifiedAuthorsByHash(entries: $ReadOnlyArray<{hash: Uint8Array, author: Uint8Array, index: number}>): Promise<Map<b64string, Device>> {
    const unverifiedEntries = await this._storage.unverifiedStore.findUnverifiedDevicesByHash(entries.map((e) => e.author));
    for (const unverifiedEntry of unverifiedEntries) {
      try {
        // TODO: Use patent-pending Single Query Multiple Data (SQMD) technology
        let user = await this._storage.userStore.findUser({ hashedUserId: unverifiedEntry.user_id });
        user = await this._unlockedProcessUser(unverifiedEntry.user_id, user, unverifiedEntry.index);
        await this._unlockedVerifyAndApplySingleUserEntry(user, unverifiedEntry);
      } catch (e) {
        if (!(e instanceof InvalidBlockError))
          throw e;
      }
    }

    const foundAuthors = await this._storage.userStore.findDevices({ hashedDeviceIds: entries.map((e) => e.author) });
    return entries.reduce((result, entry) => {
      const author = foundAuthors.get(utils.toBase64(entry.author));
      if (!author || author.revokedAt < entry.index)
        return result;

      result.set(utils.toBase64(entry.hash), author); // eslint-disable-line no-param-reassign, bogus-lints-in-reduce
      return result;
    }, new Map());
  }

  async _unlockedVerifyKeyPublishes(unverifiedKeyPublishes: Array<UnverifiedKeyPublish>): Promise<Array<VerifiedKeyPublish>> {
    const verifiedKeyPublishes = [];
    const keyPublishesAuthors = await this._unlockedGetVerifiedAuthorsByHash(unverifiedKeyPublishes);
    for (const unverifiedKeyPublish of unverifiedKeyPublishes) {
      try {
        const author = keyPublishesAuthors.get(utils.toBase64(unverifiedKeyPublish.hash));
        if (!author)
          throw new InvalidBlockError('author_not_found', 'author not found', { unverifiedKeyPublish });

        if (unverifiedKeyPublish.nature === NATURE.key_publish_to_user_group) {
          await this._unlockedProcessUserGroupWithPublicEncryptionKey(unverifiedKeyPublish.recipient);
        }

        await this._verifyKeyPublish(unverifiedKeyPublish, author);
      } catch (e) {
        if (!(e instanceof InvalidBlockError)) {
          throw e;
        }
        continue;
      }

      verifiedKeyPublishes.push({
        resourceId: unverifiedKeyPublish.resourceId,
        key: unverifiedKeyPublish.key,
        recipient: unverifiedKeyPublish.recipient,
        author: unverifiedKeyPublish.author,
        nature: unverifiedKeyPublish.nature,
      });
    }
    return verifiedKeyPublishes;
  }

  async verifyKeyPublishes(entries: Array<UnverifiedKeyPublish>): Promise<Array<VerifiedKeyPublish>> {
    return this._verifyLock.runExclusive(() => this._unlockedVerifyKeyPublishes(entries));
  }

  // ##### #### ### ## # RECURSION MECHANISMS:

  // It should only take hashes, and fetch the block under the verifier lock,
  // that way we are sure we avoid races

  // throws on unknown_author, throws on rootblockAuthor.
  async _getUnverifiedauthor(entryAuthor: Uint8Array): Promise<Entry | UnverifiedEntry> {
    const res = await this._storage.trustchainStore.findMaybeVerifiedEntryByHash(entryAuthor);
    if (!res)
      throw new InvalidBlockError('unknown_author', 'can\'t find block author', { entryAuthor });
    return res;
  }

  async _assertIsPossibleDeviceAuthor(entry: UnverifiedEntry, author: UnverifiedEntry) {
    const entryUserId = entry.user_id;
    const authorUserId = author.user_id;
    if (isTrustchainCreation(author.nature))
      return;
    if (!entryUserId || !authorUserId) {
      throw new InvalidBlockError('forbidden', 'All devices of a user must have a user_id', { entry });
    }
    if (!utils.equalArray(entryUserId, authorUserId)) {
      throw new InvalidBlockError('forbidden', 'All devices of a user must be authored by the same user', { entry });
    }
  }

  // throws on invalid or revoked authors, return { null, null } on rootBlock.
  async _unlockedGetVerifiedAuthor(entry: UnverifiedEntry, { doMissingVerifications }: {doMissingVerifications: bool} = {}): Promise<{author: Entry, authorKey: Uint8Array}> {
    let author = await this._getUnverifiedauthor(entry.author);

    if (!isTrustchainCreation(author.nature) && !isDeviceCreation(author.nature))
      throw new InvalidBlockError('invalid_author_nature', 'author of device_creation block of incorrect nature', { entry, author });

    if (!author.payload_verified) {
      // this test is only needed to have clearer messages
      if (isDeviceCreation(entry.nature) || isDeviceRevocation(entry.nature)) {
        await this._assertIsPossibleDeviceAuthor(entry, author);
      }

      if (!doMissingVerifications) {
        throw new Error('Assertion error: author should have been verified first');
      }
      if (!author.user_id)
        throw new Error('Assertion error: invalid author block without user_id');
      await this._unlockedProcessUserById(author.user_id);
      author = await this._storage.trustchainStore.getVerifiedEntryByHash(author.hash);
    }
    const authorKey = (author.payload_verified: Object).public_signature_key;

    const isAuthorRevoked = ((author.payload_verified: Object): UserDeviceRecord).revoked < entry.index;
    if (isDeviceCreation(author.nature) && isAuthorRevoked) {
      throw new InvalidBlockError('revoked_author_error', 'author of block has been revoked', { entry, author });
    }

    return {
      author,
      authorKey,
    };
  }

  async _unlockedVerifySingleUserDeviceCreation(user: ?User, entry: UnverifiedDeviceCreation): Promise<VerifiedDeviceCreation> {
    if (utils.equalArray(entry.author, this._trustchainId)) {
      const rootBlock: Object = await this._getUnverifiedauthor(entry.author);
      const authorKey = rootBlock.payload_verified.public_signature_key;
      await this._verifyDeviceCreation(entry, null, null, authorKey, user);
    } else {
      if (!user)
        throw new InvalidBlockError('unknown_author', 'can\'t find block author\'s user', { entry });
      const author = find(user.devices, d => utils.equalArray(utils.fromBase64(d.deviceId), entry.author));
      if (!author)
        throw new InvalidBlockError('unknown_author', 'can\'t find block author\'s device', { entry });
      if (author.revokedAt < entry.index)
        throw new InvalidBlockError('revoked_author_error', 'device creaton author is revoked', { entry });
      const authorKey = author.devicePublicSignatureKey;
      await this._verifyDeviceCreation(entry, user, author, authorKey, user);
    }

    return entry;
  }

  async _unlockedVerifySingleUserDeviceRevocation(targetUser: ?User, entry: UnverifiedDeviceRevocation): Promise<VerifiedDeviceRevocation> {
    const authorDeviceToUser = await this._storage.userStore.findDeviceToUser({ hashedDeviceId: entry.author });
    if (!authorDeviceToUser)
      throw new InvalidBlockError('unknown_author', 'can\'t find block author', { entry });
    const { deviceId: authorDeviceId, userId: authorUserId } = authorDeviceToUser;
    const authorUser = await this._storage.userStore.findUser({ hashedUserId: utils.fromBase64(authorUserId) });
    if (!authorUser)
      throw new Error('Assertion error: User has a device in userstore, but findUser failed!'); // Mostly just for flow. Should Never Happen™
    const deviceIndex = findIndex(authorUser.devices, (d) => d.deviceId === authorDeviceId);
    const authorDevice = authorUser.devices[deviceIndex];

    await this._verifyDeviceRevocation(entry, authorUserId, authorDevice.devicePublicSignatureKey, targetUser);
    return entry;
  }

  async _unlockedVerifySingleUser(user: ?User, entry: UnverifiedDeviceCreation | UnverifiedDeviceRevocation): Promise<VerifiedDeviceCreation | VerifiedDeviceRevocation> {
    switch (natureKind(entry.nature)) {
      case NATURE_KIND.device_creation: {
        // $FlowIKnow The type is checked by the switch
        const deviceEntry: UnverifiedDeviceCreation = entry;
        return this._unlockedVerifySingleUserDeviceCreation(user, deviceEntry);
      }
      case NATURE_KIND.device_revocation: {
        // $FlowIKnow Type is checked by the switch
        const revocationEntry: UnverifiedDeviceRevocation = entry;
        return this._unlockedVerifySingleUserDeviceRevocation(user, revocationEntry);
      }
      default:
        throw new Error(`Assertion error: unexpected nature ${entry.nature}`);
    }
  }

  async _unlockedVerifyAndApplySingleUserEntry(user: ?User, entry: UnverifiedDeviceCreation | UnverifiedDeviceRevocation): Promise<VerifiedDeviceCreation | VerifiedDeviceRevocation> {
    const verifiedEntry = await this._unlockedVerifySingleUser(user, entry);
    await this._storage.userStore.applyEntry(verifiedEntry);
    await this._storage.unverifiedStore.removeVerifiedUserEntries([verifiedEntry]);
    return verifiedEntry;
  }

  async _unlockedVerifyAndApplySingleDeviceCreation(user: ?User, entry: UnverifiedDeviceCreation): Promise<VerifiedDeviceCreation> {
    // $FlowIKnow Whatever unverified type that comes in, the matching verified type comes out
    return this._unlockedVerifyAndApplySingleUserEntry(user, entry);
  }
  async _unlockedVerifyAndApplySingleDeviceRevocation(user: ?User, entry: UnverifiedDeviceRevocation): Promise<VerifiedDeviceRevocation> {
    // $FlowIKnow Whatever unverified type that comes in, the matching verified type comes out
    return this._unlockedVerifyAndApplySingleUserEntry(user, entry);
  }

  async verifyOwnDeviceCreation(entry: UnverifiedDeviceCreation): Promise<VerifiedDeviceCreation> {
    const user = await this._storage.userStore.findUser({ hashedUserId: entry.user_id }); // TODO: We should know our own user ID instead of doing a query for it ...
    return this._unlockedVerifyAndApplySingleDeviceCreation(user, entry);
  }

  async verifyOwnDeviceRevocation(entry: UnverifiedDeviceRevocation): Promise<VerifiedDeviceRevocation> {
    const user = await this._storage.userStore.findUser({ hashedUserId: entry.user_id }); // TODO: We should know our own user ID instead of doing a query for it ...
    return this._unlockedVerifyAndApplySingleDeviceRevocation(user, entry);
  }

  async _throwingVerifyDeviceRevocation(entry: UnverifiedDeviceRevocation): Promise<VerifiedDeviceRevocation> {
    return this._verifyLock.runExclusive(async () => {
      let user = await this._storage.userStore.findUser({ hashedUserId: entry.user_id });
      user = await this._unlockedProcessUser(entry.user_id, user, entry.index);
      return this._unlockedVerifyAndApplySingleUserEntry(user, entry);
    });
  }

  async _throwingVerifyDeviceCreation(entry: UnverifiedDeviceCreation): Promise<VerifiedDeviceCreation> {
    return this._verifyLock.runExclusive(async () => {
      let user = await this._storage.userStore.findUser({ hashedUserId: entry.user_id });
      user = await this._unlockedProcessUser(entry.user_id, user, entry.index);
      return this._unlockedVerifyAndApplySingleUserEntry(user, entry);
    });
  }

  async verifyDeviceCreation(entry: UnverifiedDeviceCreation): Promise<?VerifiedDeviceCreation> {
    try {
      return await this._throwingVerifyDeviceCreation(entry);
    } catch (e) {
      if (!(e instanceof InvalidBlockError))
        throw e;
      return null;
    }
  }

  async verifyDeviceRevocation(entry: UnverifiedDeviceRevocation): Promise<?VerifiedDeviceRevocation> {
    try {
      return await this._throwingVerifyDeviceRevocation(entry);
    } catch (e) {
      if (!(e instanceof InvalidBlockError))
        throw e;
      return null;
    }
  }

  async _unlockedProcessUserById(userId: Uint8Array, beforeIndex?: number): Promise<?User> {
    const user = await this._storage.userStore.findUser({ hashedUserId: userId });
    return this._unlockedProcessUser(userId, user, beforeIndex);
  }

  async _unlockedProcessUser(userId: Uint8Array, maybeUser: ?User, beforeIndex?: number): Promise<?User> {
    let user = maybeUser;
    const unverifiedEntries = await this._storage.unverifiedStore.findUnverifiedUserEntries([userId], beforeIndex);
    for (const entry of unverifiedEntries) {
      const verifiedEntry = await this._unlockedVerifySingleUser(user, entry);
      user = await this._storage.userStore.applyEntry(verifiedEntry);
    }
    await this._storage.unverifiedStore.removeVerifiedUserEntries(unverifiedEntries);
    return user;
  }

  async _unlockedVerifySingleUserGroup(entry: UnverifiedUserGroupEntry, author: Device): Promise<VerifiedUserGroupEntry> {
    switch (natureKind(entry.nature)) {
      case NATURE_KIND.user_group_creation: {
        const groupId = (entry: any).public_signature_key;
        const group = await this._storage.groupStore.findExternal({ groupId });
        return this._verifyUserGroupCreation(entry, author, group);
      }
      case NATURE_KIND.user_group_addition: {
        const groupId = (entry: any).group_id;
        const group = await this._storage.groupStore.findExternal({ groupId });
        return this._verifyUserGroupAddition(entry, author, group);
      }
      default:
        throw new Error(`Assertion error: unexpected nature ${entry.nature}`);
    }
  }

  async _unlockedProcessUserGroups(unverifiedEntries: Array<UnverifiedUserGroupEntry>) {
    const authors = await this._unlockedGetVerifiedAuthorsByHash(unverifiedEntries);

    for (const unverifiedUserGroupEntry of unverifiedEntries) {
      const author = authors.get(utils.toBase64(unverifiedUserGroupEntry.hash));
      if (!author)
        throw new InvalidBlockError('author_not_found', 'author not found', { unverifiedUserGroupEntry });

      const verifiedEntry = await this._unlockedVerifySingleUserGroup(unverifiedUserGroupEntry, author);
      await this._groupUpdater.applyEntry(verifiedEntry);
      await this._storage.unverifiedStore.removeVerifiedUserGroupEntry(verifiedEntry);
    }
  }

  async _unlockedProcessUserGroupWithPublicEncryptionKey(key: Uint8Array) {
    const unverifiedEntries = await this._storage.unverifiedStore.findUnverifiedUserGroupByPublicEncryptionKey(key);
    if (unverifiedEntries.length === 0)
      return;
    return this._unlockedProcessUserGroups(unverifiedEntries);
  }
  async _unlockedProcessUserGroup(groupId: Uint8Array) {
    const unverifiedEntries = await this._storage.unverifiedStore.findUnverifiedUserGroup(groupId);
    if (unverifiedEntries.length === 0)
      return;
    return this._unlockedProcessUserGroups(unverifiedEntries);
  }

  async verifyTrustchainCreation(unverifiedEntry: UnverifiedEntry) {
    return this._verifyLock.runExclusive(async () => {
      await this._verifyTrustchainCreation(unverifiedEntry);
      return this._storage.trustchainStore.setEntryVerified(unverifiedEntry);
    });
  }

  async _takeOneDeviceOfEachUsers(nextDevicesToVerify) {
    const remainingDevices = [];
    const firstDeviceOfEachUser = nextDevicesToVerify.filter((entry, index, array) => {
      if (index && utils.equalArray(array[index - 1].user_id, entry.user_id)) {
        remainingDevices.push(entry);
        return false;
      }
      return true;
    });

    return [firstDeviceOfEachUser, remainingDevices];
  }

  async updateUserStore(userIds: Array<Uint8Array>) {
    await this._verifyLock.runExclusive(async () => {
      let nextDevicesToVerify = await this._storage.unverifiedStore.findUnverifiedUserEntries(userIds);

      // We want to batch the first device of every user, then the 2nd of every user, then the 3rd..., so sort by user first
      nextDevicesToVerify.sort((a, b) => compareSameSizeUint8Arrays(a.user_id, b.user_id));

      let currentDevicesToVerify = [];
      do {
        const verifiedDevices = [];
        [currentDevicesToVerify, nextDevicesToVerify] = await this._takeOneDeviceOfEachUsers(nextDevicesToVerify);
        for (const entry of currentDevicesToVerify) {
          const user = await this._storage.userStore.findUser({ hashedUserId: entry.user_id });
          verifiedDevices.push(await this._unlockedVerifySingleUser(user, entry));
        }
        await this._storage.userStore.applyEntries(verifiedDevices);
        await this._storage.unverifiedStore.removeVerifiedUserEntries(verifiedDevices);
      } while (nextDevicesToVerify.length > 0);
    });
  }

  async updateGroupStore(groupIds: Array<Uint8Array>) {
    await this._verifyLock.runExclusive(async () => {
      for (const groupId of groupIds) {
        await this._unlockedProcessUserGroup(groupId);
      }
    });
  }
}
