// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { makeBuffer } from './utils';
import { expect } from './chai';

import { entryToDbEntry, dbEntryToEntry, type UnverifiedEntry } from '../Blocks/entries';
import { NATURE } from '../Blocks/payloads';

describe('entryToDbEntry', () => {
  const author = makeBuffer('fake author', tcrypto.HASH_SIZE);
  const hash = makeBuffer('fake hash', tcrypto.HASH_SIZE);
  const signature = makeBuffer('fake signature', tcrypto.HASH_SIZE);
  const key = makeBuffer('fake pub key', tcrypto.HASH_SIZE);


  const simpleEntry: UnverifiedEntry = {
    index: 0,
    nature: NATURE.key_publish_to_user,
    hash,
    author,
    signature,
    payload_unverified: {
      public_signature_key: key,
    },
  };

  const transformedSimpleEntry = {
    _id: 42,
    index: 0,
    nature: 8,
    hash: utils.toBase64(hash),
    author: utils.toBase64(author),
    signature: utils.toBase64(signature),
    public_signature_key: utils.toBase64(key),
  };

  const restoredSimpleEntry = {
    index: 0,
    nature: NATURE.key_publish_to_user,
    hash,
    author,
    signature,
    public_signature_key: key,
  };

  const userPrivKey = {
    recipient: author,
    key,
  };
  const tansformedUserPrivKey = {
    recipient: utils.toBase64(author),
    key: utils.toBase64(key)
  };
  const userKeys = {
    public_encryption_key: key,
    previous_public_encryption_key: key,
    encrypted_previous_encryption_key: key,
    private_keys: [userPrivKey, userPrivKey]
  };

  const notSoSimpleEntry = { ...simpleEntry };
  notSoSimpleEntry.payload_unverified = {
    device_id: hash,
    user_keys: userKeys
  };

  const transformedNotSoSimpleEntry = {
    _id: 42,
    index: 0,
    nature: 8,
    hash: utils.toBase64(hash),
    author: utils.toBase64(author),
    signature: utils.toBase64(signature),
    device_id: utils.toBase64(hash),
    user_keys: {
      public_encryption_key: utils.toBase64(key),
      previous_public_encryption_key: utils.toBase64(key),
      encrypted_previous_encryption_key: utils.toBase64(key),
      private_keys: [tansformedUserPrivKey, tansformedUserPrivKey]
    }
  };

  const restoredNotSoSimpleEntry = {
    index: 0,
    nature: NATURE.key_publish_to_user,
    hash,
    author,
    signature,
    device_id: hash,
    user_keys: userKeys
  };

  it('can convert simple entry', async () => {
    expect(entryToDbEntry(simpleEntry, 42)).to.deep.equal(transformedSimpleEntry);
  });

  it('can convert an entry with an array', async () => {
    expect(entryToDbEntry(notSoSimpleEntry, 42)).to.deep.equal(transformedNotSoSimpleEntry);
  });

  it('can restore a simple entry', async () => {
    expect(dbEntryToEntry(transformedSimpleEntry)).to.deep.equal(restoredSimpleEntry);
  });

  it('can restore an entry with an array', async () => {
    expect(dbEntryToEntry(transformedNotSoSimpleEntry)).to.deep.equal(restoredNotSoSimpleEntry);
  });
});
