// @flow
import { random, ready as cryptoReady, tcrypto } from '@tanker/crypto';
import { createUserSecretBinary } from '@tanker/identity';
import { expect } from '@tanker/test-utils';

import dataStoreConfig, { makePrefix, openDataStore } from '../../__tests__/TestDataStore';

import GroupStore from '../GroupStore';

describe('GroupStore', () => {
  let dbName;
  let userSecret;
  let groupStoreConfig;
  let groupStore;
  let datastore;

  before(() => cryptoReady);

  beforeEach(async () => {
    dbName = `groupStore-test-${makePrefix()}`;
    userSecret = createUserSecretBinary('trustchainid', 'Merkle–Damgård');
    groupStoreConfig = { dbName, ...dataStoreConfig, schemas: GroupStore.schemas };
    datastore = await openDataStore(groupStoreConfig);
    groupStore = await GroupStore.open(datastore, userSecret);
  });

  it('saves and finds group key pairs', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupKeyPair }]);
    const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
  });

  it('saves a key pair and finds group public key', async () => {
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair }]);
    const resKey = await groupStore.findGroupsPublicKeys([groupId]);
    expect(resKey).to.deep.equal([{
      groupId,
      publicEncryptionKey: encryptionKeyPair.publicKey,
    }]);
  });

  it('ignores updates to a group private key', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    const groupId2 = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    const groupKeyPair2 = {
      publicKey: groupKeyPair.publicKey,
      privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
    };

    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupKeyPair }]);
    await groupStore.saveGroupEncryptionKeys([{ groupId: groupId2, encryptionKeyPair: groupKeyPair2 }]);

    const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
  });

  it('saves and finds group public key', async () => {
    const publicEncryptionKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupPublicEncryptionKeys([{ groupId, publicEncryptionKey }]);
    const resKey = await groupStore.findGroupsPublicKeys([groupId]);
    expect(resKey).to.deep.equal([{ groupId, publicEncryptionKey }]);
  });

  it('ignores updates to a group private key', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    const groupKeyPair2 = {
      publicKey: groupKeyPair.publicKey,
      privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
    };

    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupKeyPair }]);
    await groupStore.saveGroupPublicEncryptionKeys([{ groupId, publicEncryptionKey: groupKeyPair2.publicKey }]);

    const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
  });

  it('updates unset group private key', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupPublicEncryptionKeys([{ groupId, publicEncryptionKey: groupKeyPair.publicKey }]);
    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupKeyPair }]);

    const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
  });

  it('returns null when asked for non existing group public key', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupKeyPair }]);
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

  it('returns empty array when asked for non existing group public key', async () => {
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    // Populate the store with data not targeted by the query
    const anotherGroupKeyPair = tcrypto.makeEncryptionKeyPair();
    const anotherGroupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    await groupStore.saveGroupEncryptionKeys([{ groupId: anotherGroupId, encryptionKeyPair: anotherGroupKeyPair }]);

    const result = await groupStore.findGroupsPublicKeys([groupId]);
    expect(result).to.deep.equal([]);
  });
});
