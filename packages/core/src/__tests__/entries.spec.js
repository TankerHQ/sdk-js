// @flow
import { tcrypto, utils } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { entryToDbEntry, dbEntryToEntry, type UnverifiedEntry } from '../Blocks/entries';
import { NATURE } from '../Blocks/Nature';
import makeUint8Array from './makeUint8Array';

describe('entryToDbEntry', () => {
  let author;
  let hash;
  let signature;
  let key;
  let simpleEntry: UnverifiedEntry;
  let transformedSimpleEntry;
  let restoredSimpleEntry;
  let userPrivKey;
  let tansformedUserPrivKey;
  let userKeys;
  let notSoSimpleEntry;
  let transformedNotSoSimpleEntry;
  let restoredNotSoSimpleEntry;

  before(() => {
    author = makeUint8Array('fake author', tcrypto.HASH_SIZE);
    hash = makeUint8Array('fake hash', tcrypto.HASH_SIZE);
    signature = makeUint8Array('fake signature', tcrypto.HASH_SIZE);
    key = makeUint8Array('fake pub key', tcrypto.HASH_SIZE);

    simpleEntry = {
      index: 0,
      nature: NATURE.key_publish_to_user,
      hash,
      author,
      signature,
      payload_unverified: {
        public_signature_key: key,
      },
    };

    transformedSimpleEntry = {
      _id: 42,
      index: 0,
      nature: 8,
      hash: utils.toBase64(hash),
      author: utils.toBase64(author),
      signature: utils.toBase64(signature),
      public_signature_key: utils.toBase64(key),
    };

    restoredSimpleEntry = {
      index: 0,
      nature: NATURE.key_publish_to_user,
      hash,
      author,
      signature,
      public_signature_key: key,
    };

    userPrivKey = {
      recipient: author,
      key,
    };

    tansformedUserPrivKey = {
      recipient: utils.toBase64(author),
      key: utils.toBase64(key)
    };

    userKeys = {
      public_encryption_key: key,
      previous_public_encryption_key: key,
      encrypted_previous_encryption_key: key,
      private_keys: [userPrivKey, userPrivKey]
    };

    notSoSimpleEntry = { ...simpleEntry };

    notSoSimpleEntry.payload_unverified = {
      device_id: hash,
      user_keys: userKeys
    };

    transformedNotSoSimpleEntry = {
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

    restoredNotSoSimpleEntry = {
      index: 0,
      nature: NATURE.key_publish_to_user,
      hash,
      author,
      signature,
      device_id: hash,
      user_keys: userKeys
    };
  });

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
