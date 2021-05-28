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

    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupKeyPair }]);
    const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
  });

  it('can set a group private key', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupKeyPair }]);

    const resKeyPair = await groupStore.findGroupEncryptionKeyPair(groupKeyPair.publicKey);
    expect(resKeyPair).to.deep.equal(groupKeyPair);
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

  it('returns null when asked for non existing group key pair', async () => {
    const groupKeyPair = tcrypto.makeEncryptionKeyPair();
    const groupId = random(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    await groupStore.saveGroupEncryptionKeys([{ groupId, encryptionKeyPair: groupKeyPair }]);
    const publicKey = random(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE);

    const resKeyPair = await groupStore.findGroupEncryptionKeyPair(publicKey);
    expect(resKeyPair).to.be.null;
  });
});
