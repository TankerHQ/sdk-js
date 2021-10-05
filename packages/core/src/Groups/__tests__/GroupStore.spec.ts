import { random, ready as cryptoReady, tcrypto } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';
import dataStoreConfig, { makePrefix, openDataStore } from '../../__tests__/TestDataStore';
import GroupStore from '../GroupStore';

describe('GroupStore', () => {
  let dbName;
  let userSecret;
  let groupStoreConfig;
  let groupStore: GroupStore;
  let datastore;

  before(() => cryptoReady);

  beforeEach(async () => {
    dbName = `groupStore-test-${makePrefix()}`;
    userSecret = createUserSecretBinary('trustchainid', 'Merkle–Damgård');
    groupStoreConfig = { dbName, ...dataStoreConfig, schemas: GroupStore.schemas };
    datastore = await openDataStore(groupStoreConfig);
    groupStore = await GroupStore.open(datastore, userSecret);
  });

  describe('saveGroupPublicEncryptionKeys', () => {
    it('saves and finds group public key', async () => {
      const publicEncryptionKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

      await groupStore.saveGroupPublicEncryptionKeys([{ groupId, publicEncryptionKey }]);
      const resKey = await groupStore.findGroupsPublicKeys([groupId]);
      expect(resKey).to.deep.equal([{ groupId, publicEncryptionKey }]);
    });

    it('does not insert when groupId or public key exists', async () => {
      const publicEncryptionKey = random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE);
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
      const groupId2 = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
      const publicEncryptionKey2 = random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE);

      await groupStore.saveGroupPublicEncryptionKeys([{ groupId, publicEncryptionKey }]);
      await groupStore.saveGroupPublicEncryptionKeys([{ groupId, publicEncryptionKey: publicEncryptionKey2 }]);
      await groupStore.saveGroupPublicEncryptionKeys([{ groupId: groupId2, publicEncryptionKey }]);

      expect(await groupStore.findGroupsPublicKeys([groupId])).to.deep.eq([{ groupId, publicEncryptionKey }]);
      expect(await groupStore.findGroupsPublicKeys([groupId2])).to.deep.eq([]);
    });
  });

  describe('saveGroupEncryptionKeys', () => {
    it('saves and finds group key pairs', async () => {
      const groupKeyPair = tcrypto.makeEncryptionKeyPair();
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

      await groupStore.saveGroupEncryptionKeys([{
        groupId,
        publicEncryptionKey: groupKeyPair.publicKey,
        privateEncryptionKey: groupKeyPair.privateKey,
      }]);
      const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
      expect(resKeyPair).to.deep.equal(groupKeyPair);
    });

    it('saves a key pair and finds group public key', async () => {
      const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

      await groupStore.saveGroupEncryptionKeys([{
        groupId,
        publicEncryptionKey: encryptionKeyPair.publicKey,
        privateEncryptionKey: encryptionKeyPair.privateKey,
      }]);
      const resKey = await groupStore.findGroupsPublicKeys([groupId]);
      expect(resKey).to.deep.equal([{
        groupId,
        publicEncryptionKey: encryptionKeyPair.publicKey,
      }]);
    });

    it('updates unset group private key', async () => {
      const groupKeyPair = tcrypto.makeEncryptionKeyPair();
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

      await groupStore.saveGroupPublicEncryptionKeys([{ groupId, publicEncryptionKey: groupKeyPair.publicKey }]);
      await groupStore.saveGroupEncryptionKeys([{
        groupId,
        publicEncryptionKey: groupKeyPair.publicKey,
        privateEncryptionKey: groupKeyPair.privateKey,
      }]);
      const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
      expect(resKeyPair).to.deep.equal(groupKeyPair);
    });

    it('ignores updates to a group private key', async () => {
      const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

      const groupKeyPair = {
        publicKey: encryptionKeyPair.publicKey,
        privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
      };

      await groupStore.saveGroupEncryptionKeys([{
        groupId,
        publicEncryptionKey: encryptionKeyPair.publicKey,
        privateEncryptionKey: encryptionKeyPair.privateKey,
      }]);
      await groupStore.saveGroupEncryptionKeys([{
        groupId,
        publicEncryptionKey: groupKeyPair.publicKey,
        privateEncryptionKey: groupKeyPair.privateKey,
      }]);

      const resKeyPair = await groupStore.findGroupEncryptionKeyPair(encryptionKeyPair.publicKey);
      expect(resKeyPair).to.deep.equal(encryptionKeyPair);
    });

    it('ignores updates if groupId and public key do not match', async () => {
      const groupKeyPair = tcrypto.makeEncryptionKeyPair();
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
      const groupId2 = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
      const groupKeyPair2 = tcrypto.makeEncryptionKeyPair();
      const groupKeyPair3 = {
        publicKey: groupKeyPair.publicKey,
        privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
      };

      // prepare keys with empty private part
      await groupStore.saveGroupPublicEncryptionKeys([{ groupId, publicEncryptionKey: groupKeyPair.publicKey }]);

      // different public key
      await groupStore.saveGroupEncryptionKeys([{
        groupId,
        publicEncryptionKey: groupKeyPair2.publicKey,
        privateEncryptionKey: groupKeyPair2.privateKey,
      }]);

      // different groupId
      await groupStore.saveGroupEncryptionKeys([{
        groupId: groupId2,
        publicEncryptionKey: groupKeyPair3.publicKey,
        privateEncryptionKey: groupKeyPair3.privateKey,
      }]);

      // matching public key and groupId
      await groupStore.saveGroupEncryptionKeys([{
        groupId,
        publicEncryptionKey: groupKeyPair.publicKey,
        privateEncryptionKey: groupKeyPair.privateKey,
      }]);

      expect(await groupStore.findGroupEncryptionKeyPair(groupKeyPair2.publicKey)).to.be.null;
      const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
      expect(resKeyPair).to.deep.equal(groupKeyPair);
    });
  });

  describe('findGroupEncryptionKeyPair', () => {
    it('returns null when asked for non existing group public key', async () => {
      const groupKeyPair = tcrypto.makeEncryptionKeyPair();
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
      await groupStore.saveGroupEncryptionKeys([{
        groupId,
        publicEncryptionKey: groupKeyPair.publicKey,
        privateEncryptionKey: groupKeyPair.privateKey,
      }]);
      const publicKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);

      const resKeyPair = await groupStore.findGroupEncryptionKeyPair(publicKey);
      expect(resKeyPair).to.be.null;
    });

    it('returns null when asked for unset group private key', async () => {
      const groupKeyPair = tcrypto.makeEncryptionKeyPair();
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
      await groupStore.saveGroupPublicEncryptionKeys([{
        groupId,
        publicEncryptionKey: groupKeyPair.publicKey,
      }]);

      const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
      expect(resKeyPair).to.be.null;
    });
  });

  describe('findGroupsPublicKeys', () => {
    it('returns empty array when asked for non existing group public key', async () => {
      const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

      // Populate the store with data not targeted by the query
      const anotherGroupKeyPair = tcrypto.makeEncryptionKeyPair();
      const anotherGroupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
      await groupStore.saveGroupEncryptionKeys([{
        groupId: anotherGroupId,
        publicEncryptionKey: anotherGroupKeyPair.publicKey,
        privateEncryptionKey: anotherGroupKeyPair.privateKey,
      }]);

      const result = await groupStore.findGroupsPublicKeys([groupId]);
      expect(result).to.deep.equal([]);
    });
  });
});
