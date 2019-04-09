// @flow
import find from 'array-find';
import { utils, type b64string } from '@tanker/crypto';
import { InvalidBlockError } from '../errors.internal';
import { findIndex, compareSameSizeUint8Arrays } from '../utils';
import TaskQueue from '../TaskQueue';
import { type User, type Device } from '../Users/User';
import GroupUpdater from '../Groups/GroupUpdater';
import { type UnverifiedKeyPublish, type VerifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import type { UnverifiedDeviceCreation, VerifiedDeviceCreation, UnverifiedDeviceRevocation, VerifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { type UnverifiedUserGroup, type VerifiedUserGroup } from '../UnverifiedStore/UserGroupsUnverifiedStore';
import { type UnverifiedProvisionalIdentityClaim, type VerifiedProvisionalIdentityClaim } from '../UnverifiedStore/ProvisionalIdentityClaimUnverifiedStore';
import { type UnverifiedTrustchainCreation } from './TrustchainStore';

import {
  NATURE,
  NATURE_KIND,
  natureKind,
  isKeyPublishToDevice,
  isKeyPublishToUser,
  isKeyPublishToProvisionalUser,
} from '../Blocks/Nature';

import Storage from '../Session/Storage';

import {
  verifyTrustchainCreation,
  verifyDeviceCreation,
  verifyDeviceRevocation,
  verifyKeyPublish,
  verifyUserGroupCreation,
  verifyUserGroupAddition,
  verifyProvisionalIdentityClaim,
} from './Verify';

export default class TrustchainVerifier {
  _verifyQueue: TaskQueue = new TaskQueue();
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
        else
          console.error('invalid block', e);
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
        } else if (isKeyPublishToProvisionalUser(keyPublish.nature)) {
          verifiedKeyPublish = verifyKeyPublish(keyPublish, author, null, null);
        } else {
          const recipient = await this._storage.groupStore.findExternal({ groupPublicEncryptionKey: keyPublish.recipient });
          verifiedKeyPublish = verifyKeyPublish(keyPublish, author, null, recipient);
        }
        verifiedKeyPublishes.push(verifiedKeyPublish);
      } catch (e) {
        if (!(e instanceof InvalidBlockError))
          throw e;
        else
          console.error('invalid block', e);
        continue;
      }
    }
    return verifiedKeyPublishes;
  }

  async verifyKeyPublishes(entries: Array<UnverifiedKeyPublish>): Promise<Array<VerifiedKeyPublish>> {
    return this._verifyQueue.enqueue(() => this._unlockedVerifyKeyPublishes(entries));
  }

  async _unlockedVerifySingleUserDeviceCreation(user: ?User, entry: UnverifiedDeviceCreation): Promise<VerifiedDeviceCreation> {
    if (utils.equalArray(entry.author, this._trustchainId)) {
      const authorKey = this._storage.trustchainStore.trustchainPublicKey;
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

  async _throwingVerifyDeviceCreation(entry: UnverifiedDeviceCreation): Promise<VerifiedDeviceCreation> {
    return this._verifyQueue.enqueue(async () => {
      let user = await this._storage.userStore.findUser({ userId: entry.user_id });
      user = await this._unlockedProcessUser(entry.user_id, user, entry.index);
      const promise: Promise<VerifiedDeviceCreation> = (this._unlockedVerifyAndApplySingleUserEntry(user, entry): any);
      return promise;
    });
  }

  async verifyDeviceCreation(entry: UnverifiedDeviceCreation): Promise<?VerifiedDeviceCreation> {
    try {
      return await this._throwingVerifyDeviceCreation(entry);
    } catch (e) {
      if (!(e instanceof InvalidBlockError))
        throw e;
      else
        console.error('invalid block', e);
      return null;
    }
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

  async _unlockedVerifyClaims(claims: Array<UnverifiedProvisionalIdentityClaim>): Promise<Array<VerifiedProvisionalIdentityClaim>> {
    const verifiedClaims = [];
    for (const claim of claims) {
      try {
        const authorUser = await this._storage.userStore.findUser({ deviceId: claim.author });
        if (!authorUser)
          throw new InvalidBlockError('author_not_found', 'author not found', { claim });

        const deviceIndex = findIndex(authorUser.devices, (d) => d.deviceId === utils.toBase64(claim.author));
        const authorDevice = authorUser.devices[deviceIndex];

        verifiedClaims.push(verifyProvisionalIdentityClaim(claim, authorDevice, utils.fromBase64(authorUser.userId)));
      } catch (e) {
        if (!(e instanceof InvalidBlockError)) {
          throw e;
        } else {
          console.error('invalid block', e);
        }
        continue;
      }
    }
    return verifiedClaims;
  }

  async verifyTrustchainCreation(unverifiedTrustchainCreation: UnverifiedTrustchainCreation) {
    return this._verifyQueue.enqueue(async () => {
      verifyTrustchainCreation(unverifiedTrustchainCreation, this._trustchainId);
      return this._storage.trustchainStore.setTrustchainPublicKey(unverifiedTrustchainCreation.public_signature_key);
    });
  }

  async _takeOneDeviceOfEachUsers(
    nextDevicesToVerify: Array<UnverifiedDeviceCreation | UnverifiedDeviceRevocation>
  ): Promise<Array<Array<UnverifiedDeviceCreation | UnverifiedDeviceRevocation>>> {
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
    await this._verifyQueue.enqueue(async () => {
      let nextDevicesToVerify = await this._storage.unverifiedStore.findUnverifiedUserEntries(userIds);

      // We want to batch the first device of every user, then the 2nd of every user, then the 3rd..., so sort by user first
      // And sort() is not stable so keep stuff sorted by index
      nextDevicesToVerify.sort((a, b) => {
        const userIdRes = compareSameSizeUint8Arrays(a.user_id, b.user_id);
        if (userIdRes !== 0)
          return userIdRes;
        return a.index - b.index;
      });

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
    await this._verifyQueue.enqueue(async () => {
      for (const groupId of groupIds) {
        await this._unlockedProcessUserGroup(groupId);
      }
    });
  }

  async verifyClaimsForUser(userId: Uint8Array) {
    await this._verifyQueue.enqueue(async () => {
      const unverifiedClaims = await this._storage.unverifiedStore.findUnverifiedProvisionalIdentityClaims(userId);

      const verifiedClaims = await this._unlockedVerifyClaims(unverifiedClaims);
      await this._storage.userStore.applyProvisionalIdentityClaims(verifiedClaims);
      await this._storage.unverifiedStore.removeVerifiedProvisionalIdentityClaimEntries(verifiedClaims);
    });
  }
}
