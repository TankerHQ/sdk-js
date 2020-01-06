// @flow
import { random, tcrypto } from '@tanker/crypto';
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

    await groupStore.saveGroupKeyPair(groupId, groupKeyPair);
    const resKeyPair = await groupStore.findGroupKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
  });

  it('saves and finds group public key', async () => {
    const publicEncryptionKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupsPublicKeys([{ groupId, publicEncryptionKey }]);
    const resKey = await groupStore.findGroupsPublicKeys([groupId]);
    expect(resKey).to.deep.equal([{ groupId, publicEncryptionKey }]);
  });

  it('saves a key pair and finds group public key', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupKeyPair(groupId, groupKeyPair);
    const resKey = await groupStore.findGroupsPublicKeys([groupId]);
    expect(resKey).to.deep.equal([{ groupId, publicEncryptionKey: groupKeyPair.publicKey }]);
  });

  it('can set a group private key', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupsPublicKeys([{ groupId, publicEncryptionKey: groupKeyPair.publicKey }]);
    await groupStore.saveGroupKeyPair(groupId, groupKeyPair);

    const resKeyPair = await groupStore.findGroupKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
  });

  it('ignores updates to a group public key', async () => {
    const publicEncryptionKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
    const publicEncryptionKey2 = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);

    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupsPublicKeys([{ groupId, publicEncryptionKey }]);
    await groupStore.saveGroupsPublicKeys([{ groupId, publicEncryptionKey: publicEncryptionKey2 }]);

    const resKey = await groupStore.findGroupsPublicKeys([groupId]);
    expect(resKey).to.deep.equal([{ groupId, publicEncryptionKey }]);
  });

  it('still stores non duplicate group public keys', async () => {
    const publicEncryptionKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
    const publicEncryptionKey2 = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);
    const publicEncryptionKey3 = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);

    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    const groupId2 = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupsPublicKeys([{ groupId, publicEncryptionKey }]);
    await groupStore.saveGroupsPublicKeys([
      { groupId, publicEncryptionKey: publicEncryptionKey2 },
      { groupId: groupId2, publicEncryptionKey: publicEncryptionKey3 }
    ]);

    const resKey = await groupStore.findGroupsPublicKeys([groupId2]);
    expect(resKey).to.deep.equal([{ groupId: groupId2, publicEncryptionKey: publicEncryptionKey3 }]);
  });

  it('ignores updates to a group private key', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    const groupId2 = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    const groupKeyPair2 = {
      publicKey: groupKeyPair.publicKey,
      privateKey: random(tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
    };

    await groupStore.saveGroupKeyPair(groupId, groupKeyPair);
    await groupStore.saveGroupKeyPair(groupId2, groupKeyPair2);

    const resKeyPair = await groupStore.findGroupKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
  });

  it('returns null when asked for non existing group key pair', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    await groupStore.saveGroupKeyPair(groupId, groupKeyPair);
    const publicKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);

    const resKeyPair = await groupStore.findGroupKeyPair(publicKey);
    expect(resKeyPair).to.be.null;
  });

  it('returns null when asked for non existing group key pair', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    await groupStore.saveGroupsPublicKeys([{ groupId, publicEncryptionKey: groupKeyPair.publicKey }]);

    const resKeyPair = await groupStore.findGroupKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.be.null;
  });

  it('returns empty array when asked for non existing group public key', async () => {
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    // Populate the store with data not targeted by the query
    const anotherGroupKeyPair = tcrypto.makeEncryptionKeyPair();
    const anotherGroupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    await groupStore.saveGroupKeyPair(anotherGroupId, anotherGroupKeyPair);

    const result = await groupStore.findGroupsPublicKeys([groupId]);
    expect(result).to.deep.equal([]);
  });
});
