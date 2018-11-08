// @flow
import { Mutex } from 'async-mutex';
import find from 'array-find';
import { utils, type b64string } from '@tanker/crypto';
import { InvalidBlockError } from '../errors';
import type { Entry, UnverifiedEntry } from '../Blocks/entries';
import { findIndex, compareSameSizeUint8Arrays } from '../utils';
import { type User, type Device } from '../Users/UserStore';
import GroupUpdater from '../Groups/GroupUpdater';
import { type UnverifiedKeyPublish, type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import type { UnverifiedDeviceCreation, VerifiedDeviceCreation, UnverifiedDeviceRevocation, VerifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { type UnverifiedUserGroup, type VerifiedUserGroup } from '../UnverifiedStore/UserGroupsUnverifiedStore';

import {
  type UserDeviceRecord,
  NATURE,
  NATURE_KIND,
  natureKind,
  isDeviceCreation,
  isDeviceRevocation,
  isTrustchainCreation,
  isKeyPublishToDevice,
  isKeyPublishToUser,
} from '../Blocks/payloads';

import Storage from '../Session/Storage';

import {
  verifyTrustchainCreation,
  verifyDeviceCreation,
  verifyDeviceRevocation,
  verifyKeyPublish,
  verifyUserGroupCreation,
  verifyUserGroupAddition,
} from './Verify';

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

  // Returns a map from entry hash to author entry, if the author could be found, verified, and was not revoked at the given index
  async _unlockedGetVerifiedAuthorsByHash(entries: $ReadOnlyArray<{hash: Uint8Array, author: Uint8Array, index: number}>): Promise<Map<b64string, Device>> {
    const unverifiedEntries = await this._storage.unverifiedStore.findUnverifiedDevicesByHash(entries.map((e) => e.author));
    for (const unverifiedEntry of unverifiedEntries) {
      try {
        // TODO: Use patent-pending Single Query Multiple Data (SQMD) technology
        let user = await this._storage.userStore.findUser({ userId: unverifiedEntry.user_id });
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

  async _unlockedVerifyKeyPublishes(keyPublishes: Array<UnverifiedKeyPublish>): Promise<Array<VerifiedKeyPublish>> {
    const verifiedKeyPublishes = [];
    const keyPublishesAuthors = await this._unlockedGetVerifiedAuthorsByHash(keyPublishes);
    for (const keyPublish of keyPublishes) {
      try {
        const author = keyPublishesAuthors.get(utils.toBase64(keyPublish.hash));
        if (!author)
          throw new InvalidBlockError('author_not_found', 'author not found', { keyPublish });

        if (keyPublish.nature === NATURE.key_publish_to_user_group) {
          await this._unlockedProcessUserGroupWithPublicEncryptionKey(keyPublish.recipient);
        }

        let verifiedKeyPublish;
        if (isKeyPublishToDevice(keyPublish.nature)) {
          const recipient = await this._storage.userStore.findUser({ deviceId: keyPublish.recipient });
          verifiedKeyPublish = verifyKeyPublish(keyPublish, author, recipient);
        } else if (isKeyPublishToUser(keyPublish.nature)) {
          const recipient = await this._storage.userStore.findUser({ userPublicKey: keyPublish.recipient });
          verifiedKeyPublish = verifyKeyPublish(keyPublish, author, recipient);
        } else {
          const recipient = await this._storage.groupStore.findExternal({ groupPublicEncryptionKey: keyPublish.recipient });
          verifiedKeyPublish = verifyKeyPublish(keyPublish, author, null, recipient);
        }
        verifiedKeyPublishes.push(verifiedKeyPublish);
      } catch (e) {
        if (!(e instanceof InvalidBlockError)) {
          throw e;
        }
        continue;
      }
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
      verifyDeviceCreation(entry, null, null, authorKey, user);
    } else {
      if (!user)
        throw new InvalidBlockError('unknown_author', 'can\'t find block author\'s user', { entry });
      const author = find(user.devices, d => utils.equalArray(utils.fromBase64(d.deviceId), entry.author));
      const authorKey = author.devicePublicSignatureKey;
      verifyDeviceCreation(entry, user, author, authorKey, user);
    }

    return entry;
  }

  async _unlockedVerifySingleUserDeviceRevocation(targetUser: ?User, entry: UnverifiedDeviceRevocation): Promise<VerifiedDeviceRevocation> {
    const authorUser = await this._storage.userStore.findUser({ deviceId: entry.author });
    if (!authorUser)
      throw new Error('Assertion error: User has a device in userstore, but findUser failed!'); // Mostly just for flow. Should Never Happen™
    const deviceIndex = findIndex(authorUser.devices, (d) => d.deviceId === utils.toBase64(entry.author));
    const authorDevice = authorUser.devices[deviceIndex];

    verifyDeviceRevocation(entry, authorUser.userId, authorDevice.devicePublicSignatureKey, targetUser);
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
    const user = await this._storage.userStore.findUser({ userId: entry.user_id });
    return this._unlockedVerifyAndApplySingleDeviceCreation(user, entry);
  }

  async verifyOwnDeviceRevocation(entry: UnverifiedDeviceRevocation): Promise<VerifiedDeviceRevocation> {
    const user = await this._storage.userStore.findUser({ userId: entry.user_id });
    return this._unlockedVerifyAndApplySingleDeviceRevocation(user, entry);
  }

  async _throwingVerifyDeviceRevocation(entry: UnverifiedDeviceRevocation): Promise<VerifiedDeviceRevocation> {
    return this._verifyLock.runExclusive(async () => {
      let user = await this._storage.userStore.findUser({ userId: entry.user_id });
      user = await this._unlockedProcessUser(entry.user_id, user, entry.index);
      return this._unlockedVerifyAndApplySingleUserEntry(user, entry);
    });
  }

  async _throwingVerifyDeviceCreation(entry: UnverifiedDeviceCreation): Promise<VerifiedDeviceCreation> {
    return this._verifyLock.runExclusive(async () => {
      let user = await this._storage.userStore.findUser({ userId: entry.user_id });
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
    const user = await this._storage.userStore.findUser({ userId });
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

  async _unlockedVerifySingleUserGroup(entry: UnverifiedUserGroup, author: Device): Promise<VerifiedUserGroup> {
    switch (natureKind(entry.nature)) {
      case NATURE_KIND.user_group_creation: {
        const groupId = (entry: any).public_signature_key;
        const group = await this._storage.groupStore.findExternal({ groupId });
        return verifyUserGroupCreation(entry, author, group);
      }
      case NATURE_KIND.user_group_addition: {
        const groupId = (entry: any).group_id;
        const group = await this._storage.groupStore.findExternal({ groupId });
        return verifyUserGroupAddition(entry, author, group);
      }
      default:
        throw new Error(`Assertion error: unexpected nature ${entry.nature}`);
    }
  }

  async _unlockedProcessUserGroups(unverifiedEntries: Array<UnverifiedUserGroup>) {
    const authors = await this._unlockedGetVerifiedAuthorsByHash(unverifiedEntries);

    for (const unverifiedUserGroup of unverifiedEntries) {
      const author = authors.get(utils.toBase64(unverifiedUserGroup.hash));
      if (!author)
        throw new InvalidBlockError('author_not_found', 'author not found', { unverifiedUserGroup });

      const verifiedEntry = await this._unlockedVerifySingleUserGroup(unverifiedUserGroup, author);
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
      verifyTrustchainCreation(unverifiedEntry, this._trustchainId);
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
          const user = await this._storage.userStore.findUser({ userId: entry.user_id });
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
