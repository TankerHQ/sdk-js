// @flow

import { tcrypto } from '@tanker/crypto';

import { expect } from './chai';
import { type UserGroupAdditionRecord, type UserGroupCreationRecord, type UserDeviceRecord, type DeviceRevocationRecord } from '../Blocks/payloads';

import { makeTrustchainBuilder } from './TrustchainBuilder';

import { type UnverifiedDeviceCreation, type UnverifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { type UnverifiedUserGroup, type VerifiedUserGroup } from '../UnverifiedStore/UserGroupsUnverifiedStore';

describe('UnverifiedStore', () => {
  describe('key publishes', () => {
    it('returns null when fetching a missing key publish', async () => {
      const { unverifiedStore } = await makeTrustchainBuilder();
      const actual = await unverifiedStore.findUnverifiedKeyPublish(new Uint8Array(0));
      expect(actual).to.equal(null);
    });

    it('finds an unverified key publish', async () => {
      const builder = await makeTrustchainBuilder();
      const { unverifiedStore } = builder;
      const alice = await builder.addUserV3('alice');

      const { resourceId, symmetricKey } = await builder.addKeyPublishToUser({ from: alice, to: alice });

      const actual = await unverifiedStore.findUnverifiedKeyPublish(resourceId);
      if (!actual)
        throw new Error('Failed to find key publish (flow hint)');
      if (!alice.user.userKeys)
        throw new Error('Cannot happen, someone should tell flow.');
      const decryptedKey = tcrypto.sealDecrypt(actual.key, alice.user.userKeys);

      expect(actual.resourceId).to.deep.equal(resourceId);
      expect(decryptedKey).to.deep.equal(symmetricKey);
    });
  });

  describe('user devices & revocations', () => {
    let store: any;
    let deviceId;
    let userId;
    let deviceEntry: UnverifiedDeviceCreation;
    let revocationEntry: UnverifiedDeviceRevocation;

    beforeEach(async () => {
      const builder = await makeTrustchainBuilder();
      const { generator, unverifiedStore } = builder;
      store = unverifiedStore;
      await generator.newUserCreationV3('alice');

      const aliceDev = await generator.newDeviceCreationV3({ userId: 'alice', parentIndex: 0 });
      const revocation = await generator.newDeviceRevocationV2(aliceDev.device, aliceDev.device);
      await unverifiedStore.addUnverifiedUserEntries([aliceDev.entry, revocation.entry]);

      const otherDevice = await generator.newUserCreationV3('bob');
      const otherRevocation = await generator.newDeviceRevocationV2(otherDevice.device, otherDevice.device);
      await unverifiedStore.addUnverifiedUserEntries([otherDevice.entry, otherRevocation.entry]);

      const creationPayload: UserDeviceRecord = (aliceDev.entry.payload_unverified: any);
      deviceEntry = {
        index: aliceDev.entry.index,
        nature: aliceDev.entry.nature,
        author: aliceDev.entry.author,
        hash: aliceDev.entry.hash,
        signature: aliceDev.entry.signature,
        ...creationPayload,
      };

      const revocationPayload: DeviceRevocationRecord = (revocation.entry.payload_unverified: any);
      revocationEntry = {
        index: revocation.entry.index,
        nature: revocation.entry.nature,
        author: revocation.entry.author,
        hash: revocation.entry.hash,
        signature: revocation.entry.signature,
        ...revocationPayload,
        user_id: creationPayload.user_id,
      };

      deviceId = deviceEntry.hash;
      userId = deviceEntry.user_id;
    });

    it('returns an empty array when fetching a missing user device', async () => {
      const result = await store.findUnverifiedDevicesByHash([new Uint8Array(0)]);
      expect(result).to.deep.equal([]);
    });

    it('finds an unverified user device', async () => {
      const result = (await store.findUnverifiedDevicesByHash([deviceId])).map(r => {
        const res = r;
        delete res._rev; //eslint-disable-line no-underscore-dangle
        return res;
      });
      expect(result).to.deep.equal([deviceEntry]);
    });

    it('finds an unverified device revocation by hash', async () => {
      const result = await store.findUnverifiedDeviceRevocationByHash(revocationEntry.hash);
      delete result._rev; //eslint-disable-line no-underscore-dangle
      expect(result).to.deep.equal(revocationEntry);
    });

    it('finds all entries for a user', async () => {
      const result = (await store.findUnverifiedUserEntries([userId])).map(r => {
        const res = r;
        delete res._rev; //eslint-disable-line no-underscore-dangle
        return res;
      });
      expect(result).to.deep.equal([deviceEntry, revocationEntry]);
    });

    it('finds user entries before index', async () => {
      const result = (await store.findUnverifiedUserEntries([userId], revocationEntry.index)).map(r => {
        const res = r;
        delete res._rev; //eslint-disable-line no-underscore-dangle
        return res;
      });
      expect(result).to.deep.equal([deviceEntry]);
    });

    it('can remove an entry (and not find it again)', async () => {
      await store.removeVerifiedUserEntries([deviceEntry]);
      const result = (await store.findUnverifiedUserEntries([userId])).map(r => {
        const res = r;
        delete res._rev; //eslint-disable-line no-underscore-dangle
        return res;
      });
      expect(result).to.deep.equal([revocationEntry]);
    });
  });

  describe('user groups ', () => {
    let store: any;
    let groupId;
    let groupKey;
    let creationEntry: UnverifiedUserGroup;
    let additionEntry: UnverifiedUserGroup;

    beforeEach(async () => {
      const builder = await makeTrustchainBuilder();
      const { generator, unverifiedStore } = builder;
      store = unverifiedStore;
      const alice = await builder.addUserV3('alice');

      const group = await generator.newUserGroupCreation(alice.device, ['alice']);
      await unverifiedStore.addUnverifiedUserGroups([group.entry]);

      const addition = await generator.newUserGroupAddition(alice.device, group, ['alice']);
      await unverifiedStore.addUnverifiedUserGroups([addition.entry]);

      const creationPayload: UserGroupCreationRecord = (group.entry.payload_unverified: any);
      creationEntry = {
        index: group.entry.index,
        nature: group.entry.nature,
        author: group.entry.author,
        hash: group.entry.hash,
        signature: group.entry.signature,
        ...creationPayload,
        group_id: creationPayload.public_signature_key
      };

      const additionPayload: UserGroupAdditionRecord = (addition.entry.payload_unverified: any);
      additionEntry = {
        index: addition.entry.index,
        nature: addition.entry.nature,
        author: addition.entry.author,
        hash: addition.entry.hash,
        signature: addition.entry.signature,
        ...additionPayload
      };

      groupId = creationPayload.public_signature_key;
      groupKey = creationPayload.public_encryption_key;
    });

    it('returns empty array when fetching a missing user group', async () => {
      const result = await store.findUnverifiedUserGroup(new Uint8Array(0));
      expect(result).to.deep.equal([]);
    });

    it('returns empty array when fetching a missing user group', async () => {
      const result = await store.findUnverifiedUserGroupByPublicEncryptionKey(new Uint8Array(0));
      expect(result).to.deep.equal([]);
    });

    it('finds an unverified user group ', async () => {
      const result = (await store.findUnverifiedUserGroup(groupId)).map(r => {
        const res = r;
        delete res._rev; //eslint-disable-line no-underscore-dangle
        return res;
      });
      expect(result).to.deep.equal([creationEntry, additionEntry]);
    });

    it('finds an unverified user group by encryption key', async () => {
      const result = (await store.findUnverifiedUserGroupByPublicEncryptionKey(groupKey)).map(r => {
        const res = r;
        delete res._rev; //eslint-disable-line no-underscore-dangle
        return res;
      });
      expect(result).to.deep.equal([creationEntry, additionEntry]);
    });

    it('deletes a verified user group creation', async () => {
      await store.removeVerifiedUserGroupEntry((creationEntry: VerifiedUserGroup));
      const result = (await store.findUnverifiedUserGroup(groupId)).map(r => {
        const res = r;
        delete res._rev; //eslint-disable-line no-underscore-dangle
        return res;
      });
      expect(result).to.deep.equal([additionEntry]);
    });

    it('deletes a verified user group addition', async () => {
      await store.removeVerifiedUserGroupEntry((additionEntry: VerifiedUserGroup));
      const result = (await store.findUnverifiedUserGroup(groupId)).map(r => {
        const res = r;
        delete res._rev; //eslint-disable-line no-underscore-dangle
        return res;
      });
      expect(result).to.deep.equal([creationEntry]);
    });
  });
});
