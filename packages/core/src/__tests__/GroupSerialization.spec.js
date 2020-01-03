// @flow

import { tcrypto } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import makeUint8Array from './makeUint8Array';

import {
  serializeUserGroupCreationV1,
  unserializeUserGroupCreationV1,
  serializeUserGroupCreationV2,
  unserializeUserGroupCreationV2,
  serializeUserGroupAdditionV1,
  unserializeUserGroupAdditionV1,
  serializeUserGroupAdditionV2,
  unserializeUserGroupAdditionV2,
} from '../Groups/Serialize';


describe('groups blocks', () => {
  it('correctly serializes/deserializes a UserGroupCreation test vector', async () => {
    const userGroupCreation = {
      public_signature_key: makeUint8Array('pub sig key', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
      public_encryption_key: makeUint8Array('pub enc key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
      encrypted_group_private_signature_key: makeUint8Array('encrypted priv sig key', tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE),
      encrypted_group_private_encryption_keys_for_users: [
        {
          public_user_encryption_key: makeUint8Array('pub user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('encrypted group priv key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        },
        {
          public_user_encryption_key: makeUint8Array('second pub user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('second encrypted group priv key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        }],
      self_signature: makeUint8Array('self signature', tcrypto.SIGNATURE_SIZE),
    };

    const payload = new Uint8Array([
      // public signature key
      0x70, 0x75, 0x62, 0x20, 0x73, 0x69, 0x67, 0x20, 0x6b, 0x65, 0x79, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // public encryption key
      0x70, 0x75, 0x62, 0x20,
      0x65, 0x6e, 0x63, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      // encrypted group private signature key
      0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x65,
      0x64, 0x20, 0x70, 0x72, 0x69, 0x76, 0x20, 0x73, 0x69, 0x67, 0x20, 0x6b,
      0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // varint
      0x02,
      // public user encryption key 1
      0x70, 0x75, 0x62,
      0x20, 0x75, 0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 1
      0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74,
      0x65, 0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69,
      0x76, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00,
      // public user encryption key 2
      0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0x20, 0x70, 0x75, 0x62, 0x20,
      0x75, 0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 2
      0x73, 0x65, 0x63,
      0x6f, 0x6e, 0x64, 0x20, 0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x65,
      0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69, 0x76,
      0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00,
      // self signature
      0x73, 0x65, 0x6c, 0x66, 0x20, 0x73, 0x69,
      0x67, 0x6e, 0x61, 0x74, 0x75, 0x72, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    expect(serializeUserGroupCreationV1(userGroupCreation)).to.deep.equal(payload);
    expect(unserializeUserGroupCreationV1(payload)).to.deep.equal(userGroupCreation);
  });

  it('correctly serializes/deserializes a UserGroupCreationV2 test vector', async () => {
    const userGroupCreation = {
      public_signature_key: makeUint8Array('pub sig key', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
      public_encryption_key: makeUint8Array('pub enc key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
      encrypted_group_private_signature_key: makeUint8Array('encrypted priv sig key', tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE),
      encrypted_group_private_encryption_keys_for_users: [
        {
          user_id: makeUint8Array('user id', tcrypto.HASH_SIZE),
          public_user_encryption_key: makeUint8Array('pub user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('encrypted group priv key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        },
        {
          user_id: makeUint8Array('second user id', tcrypto.HASH_SIZE),
          public_user_encryption_key: makeUint8Array('second pub user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('second encrypted group priv key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        }],
      encrypted_group_private_encryption_keys_for_provisional_users: [
        {
          app_provisional_user_public_signature_key: makeUint8Array('app provisional user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          tanker_provisional_user_public_signature_key: makeUint8Array('tanker provisional user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('provisional user encrypted group priv key', tcrypto.TWO_TIMES_SEALED_KEY_SIZE),
        },
        {
          app_provisional_user_public_signature_key: makeUint8Array('2nd app provisional user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          tanker_provisional_user_public_signature_key: makeUint8Array('2nd tanker provisional user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('2nd provisional user encrypted group priv key', tcrypto.TWO_TIMES_SEALED_KEY_SIZE),
        }],
      self_signature: makeUint8Array('self signature', tcrypto.SIGNATURE_SIZE),
    };

    const payload = new Uint8Array([
      // public signature key
      0x70, 0x75, 0x62, 0x20, 0x73, 0x69, 0x67, 0x20, 0x6b, 0x65, 0x79, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // public encryption key
      0x70, 0x75, 0x62, 0x20, 0x65, 0x6e, 0x63, 0x20, 0x6b, 0x65, 0x79, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private signature key
      0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x65, 0x64, 0x20, 0x70, 0x72,
      0x69, 0x76, 0x20, 0x73, 0x69, 0x67, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      // Varint
      0x02,
      // user ID 1
      0x75, 0x73, 0x65, 0x72, 0x20, 0x69, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // public user encryption key 1
      0x70, 0x75, 0x62, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 1
      0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x65, 0x64, 0x20, 0x67, 0x72,
      0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69, 0x76, 0x20, 0x6b, 0x65, 0x79,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // user ID 2
      0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20,
      0x69, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // public user encryption key 2
      0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0x20, 0x70, 0x75, 0x62, 0x20, 0x75,
      0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 2
      0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0x20, 0x65, 0x6e, 0x63, 0x72, 0x79,
      0x70, 0x74, 0x65, 0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x70,
      0x72, 0x69, 0x76, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // Varint
      0x02,
      // public app encryption key 1
      0x61, 0x70, 0x70, 0x20, 0x70, 0x72, 0x6f, 0x76, 0x69, 0x73, 0x69, 0x6f,
      0x6e, 0x61, 0x6c, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // public tanker encryption key 1
      0x74, 0x61, 0x6e, 0x6b, 0x65, 0x72, 0x20, 0x70, 0x72, 0x6f, 0x76, 0x69,
      0x73, 0x69, 0x6f, 0x6e, 0x61, 0x6c, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20,
      0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 1
      0x70, 0x72, 0x6f, 0x76, 0x69, 0x73, 0x69, 0x6f, 0x6e, 0x61, 0x6c, 0x20,
      0x75, 0x73, 0x65, 0x72, 0x20, 0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74,
      0x65, 0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69,
      0x76, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // provisional user app encryption key 2
      0x32, 0x6e, 0x64, 0x20, 0x61, 0x70, 0x70, 0x20, 0x70, 0x72, 0x6f, 0x76,
      0x69, 0x73, 0x69, 0x6f, 0x6e, 0x61, 0x6c, 0x20, 0x75, 0x73, 0x65, 0x72,
      0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00,
      // provisional user tanker encryption key 2
      0x32, 0x6e, 0x64, 0x20, 0x74, 0x61, 0x6e, 0x6b, 0x65, 0x72, 0x20, 0x70,
      0x72, 0x6f, 0x76, 0x69, 0x73, 0x69, 0x6f, 0x6e, 0x61, 0x6c, 0x20, 0x75,
      0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79, 0x00,
      // encrypted group private encryption key 2
      0x32, 0x6e, 0x64, 0x20, 0x70, 0x72, 0x6f, 0x76, 0x69, 0x73, 0x69, 0x6f,
      0x6e, 0x61, 0x6c, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20, 0x65, 0x6e, 0x63,
      0x72, 0x79, 0x70, 0x74, 0x65, 0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70,
      0x20, 0x70, 0x72, 0x69, 0x76, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // self signature
      0x73, 0x65, 0x6c, 0x66, 0x20, 0x73, 0x69, 0x67, 0x6e, 0x61, 0x74, 0x75,
      0x72, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);

    expect(serializeUserGroupCreationV2(userGroupCreation)).to.deep.equal(payload);
    expect(unserializeUserGroupCreationV2(payload)).to.deep.equal(userGroupCreation);
  });

  describe('serializing invalid group creation block', () => {
    let userGroupCreation;

    beforeEach(() => {
      userGroupCreation = {
        public_signature_key: new Uint8Array(tcrypto.SIGNATURE_PUBLIC_KEY_SIZE),
        public_encryption_key: new Uint8Array(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
        encrypted_group_private_signature_key: new Uint8Array(tcrypto.SEALED_SIGNATURE_PRIVATE_KEY_SIZE),
        encrypted_group_private_encryption_keys_for_users: [{
          public_user_encryption_key: new Uint8Array(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: new Uint8Array(tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        }],
        self_signature: new Uint8Array(tcrypto.SIGNATURE_SIZE),
      };
    });

    it('should serialize a valid a user group creation block', async () => {
      expect(() => serializeUserGroupCreationV1(userGroupCreation)).not.to.throw();
    });

    const fields = [
      'public_signature_key',
      'public_encryption_key',
      'encrypted_group_private_signature_key',
      'self_signature',
    ];
    fields.forEach(field => {
      it(`should throw when serializing a user group creation block with invalid ${field}`, async () => {
        userGroupCreation[field] = new Uint8Array(0);
        expect(() => serializeUserGroupCreationV1(userGroupCreation)).to.throw();
      });
    });
    it('should throw when serializing a user group creation block with invalid public_user_encryption_key', async () => {
      userGroupCreation.encrypted_group_private_encryption_keys_for_users[0].public_user_encryption_key = new Uint8Array(0);
      expect(() => serializeUserGroupCreationV1(userGroupCreation)).to.throw();
    });
    it('should throw when serializing a user group creation block with invalid encrypted_group_private_encryption_key', async () => {
      userGroupCreation.encrypted_group_private_encryption_keys_for_users[0].encrypted_group_private_encryption_key = new Uint8Array(0);
      expect(() => serializeUserGroupCreationV1(userGroupCreation)).to.throw();
    });
  });

  it('correctly deserializes a UserGroupAdditionV1 test vector', async () => {
    const userGroupAdd = {
      group_id: makeUint8Array('group id', tcrypto.HASH_SIZE),
      previous_group_block: makeUint8Array('prev group block', tcrypto.HASH_SIZE),
      encrypted_group_private_encryption_keys_for_users: [
        {
          public_user_encryption_key: makeUint8Array('pub user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('encrypted group priv key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        },
        {
          public_user_encryption_key: makeUint8Array('second pub user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('second encrypted group priv key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        }],
      self_signature_with_current_key: makeUint8Array('self signature', tcrypto.SIGNATURE_SIZE),
    };

    const payload = new Uint8Array([
      // group id
      0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x69, 0x64, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // previous group block
      0x70, 0x72, 0x65, 0x76, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x62,
      0x6c, 0x6f, 0x63, 0x6b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // varint
      0x02,
      // public user encryption key 1
      0x70, 0x75, 0x62,
      0x20, 0x75, 0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 1
      0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74,
      0x65, 0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69,
      0x76, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00,
      // public user encryption key 2
      0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0x20, 0x70, 0x75, 0x62, 0x20,
      0x75, 0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 2
      0x73, 0x65, 0x63,
      0x6f, 0x6e, 0x64, 0x20, 0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x65,
      0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69, 0x76,
      0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00,
      // self signature
      0x73, 0x65, 0x6c, 0x66, 0x20, 0x73, 0x69,
      0x67, 0x6e, 0x61, 0x74, 0x75, 0x72, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    expect(serializeUserGroupAdditionV1(userGroupAdd)).to.deep.equal(payload);
    expect(unserializeUserGroupAdditionV1(payload)).to.deep.equal(userGroupAdd);
  });

  it('correctly deserializes a UserGroupAdditionV2 test vector', async () => {
    const userGroupAdd = {
      group_id: makeUint8Array('group id', tcrypto.HASH_SIZE),
      previous_group_block: makeUint8Array('prev group block', tcrypto.HASH_SIZE),
      encrypted_group_private_encryption_keys_for_users: [
        {
          user_id: makeUint8Array('user id', tcrypto.HASH_SIZE),
          public_user_encryption_key: makeUint8Array('pub user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('encrypted group priv key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        },
        {
          user_id: makeUint8Array('second user id', tcrypto.HASH_SIZE),
          public_user_encryption_key: makeUint8Array('second pub user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('second encrypted group priv key', tcrypto.SEALED_ENCRYPTION_PRIVATE_KEY_SIZE),
        }],
      encrypted_group_private_encryption_keys_for_provisional_users: [
        {
          app_provisional_user_public_signature_key: makeUint8Array('app provisional user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          tanker_provisional_user_public_signature_key: makeUint8Array('tanker provisional user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('provisional encrypted group priv key', tcrypto.TWO_TIMES_SEALED_KEY_SIZE),
        },
        {
          app_provisional_user_public_signature_key: makeUint8Array('2nd app provisional user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          tanker_provisional_user_public_signature_key: makeUint8Array('2nd tanker provisional user key', tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE),
          encrypted_group_private_encryption_key: makeUint8Array('2nd provisional encrypted group priv key', tcrypto.TWO_TIMES_SEALED_KEY_SIZE),
        }],
      self_signature_with_current_key: makeUint8Array('self signature', tcrypto.SIGNATURE_SIZE),
    };

    const payload = new Uint8Array([
      // group id
      0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x69, 0x64, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // previous group block
      0x70, 0x72, 0x65, 0x76, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x62,
      0x6c, 0x6f, 0x63, 0x6b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // Varint
      0x02,
      // User ID 1
      0x75, 0x73, 0x65, 0x72, 0x20, 0x69, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // public user encryption key 1
      0x70, 0x75, 0x62, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 1
      0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x65, 0x64, 0x20, 0x67, 0x72,
      0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69, 0x76, 0x20, 0x6b, 0x65, 0x79,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // User ID 2
      0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20,
      0x69, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // public user encryption key 2
      0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0x20, 0x70, 0x75, 0x62, 0x20, 0x75,
      0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 2
      0x73, 0x65, 0x63, 0x6f, 0x6e, 0x64, 0x20, 0x65, 0x6e, 0x63, 0x72, 0x79,
      0x70, 0x74, 0x65, 0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x70,
      0x72, 0x69, 0x76, 0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // Varint
      0x02,
      // public app encryption key 1
      0x61, 0x70, 0x70, 0x20, 0x70, 0x72, 0x6f, 0x76, 0x69, 0x73, 0x69, 0x6f,
      0x6e, 0x61, 0x6c, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // public tanker encryption key 1
      0x74, 0x61, 0x6e, 0x6b, 0x65, 0x72, 0x20, 0x70, 0x72, 0x6f, 0x76, 0x69,
      0x73, 0x69, 0x6f, 0x6e, 0x61, 0x6c, 0x20, 0x75, 0x73, 0x65, 0x72, 0x20,
      0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00,
      // encrypted group private encryption key 1
      0x70, 0x72, 0x6f, 0x76, 0x69, 0x73, 0x69, 0x6f, 0x6e, 0x61, 0x6c, 0x20,
      0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x65, 0x64, 0x20, 0x67, 0x72,
      0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69, 0x76, 0x20, 0x6b, 0x65, 0x79,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // provisional user app encryption key 2
      0x32, 0x6e, 0x64, 0x20, 0x61, 0x70, 0x70, 0x20, 0x70, 0x72, 0x6f, 0x76,
      0x69, 0x73, 0x69, 0x6f, 0x6e, 0x61, 0x6c, 0x20, 0x75, 0x73, 0x65, 0x72,
      0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00,
      // provisional user tanker encryption key 2
      0x32, 0x6e, 0x64, 0x20, 0x74, 0x61, 0x6e, 0x6b, 0x65, 0x72, 0x20, 0x70,
      0x72, 0x6f, 0x76, 0x69, 0x73, 0x69, 0x6f, 0x6e, 0x61, 0x6c, 0x20, 0x75,
      0x73, 0x65, 0x72, 0x20, 0x6b, 0x65, 0x79, 0x00,
      // encrypted group private encryption key 2
      0x32, 0x6e, 0x64, 0x20, 0x70, 0x72, 0x6f, 0x76, 0x69, 0x73, 0x69, 0x6f,
      0x6e, 0x61, 0x6c, 0x20, 0x65, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74, 0x65,
      0x64, 0x20, 0x67, 0x72, 0x6f, 0x75, 0x70, 0x20, 0x70, 0x72, 0x69, 0x76,
      0x20, 0x6b, 0x65, 0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // self signature
      0x73, 0x65, 0x6c, 0x66, 0x20, 0x73, 0x69, 0x67, 0x6e, 0x61, 0x74, 0x75,
      0x72, 0x65, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);

    expect(serializeUserGroupAdditionV2(userGroupAdd)).to.deep.equal(payload);
    expect(unserializeUserGroupAdditionV2(payload)).to.deep.equal(userGroupAdd);
  });

  const fields = [
    'previous_group_block',
    'self_signature_with_current_key',
  ];
  fields.forEach(field => {
    it(`should throw when serializing an user group addition block with invalid ${field}`, async () => {
      const userGroupAdd = {
        group_id: new Uint8Array(tcrypto.HASH_SIZE),
        previous_group_block: new Uint8Array(tcrypto.HASH_SIZE),
        self_signature_with_current_key: new Uint8Array(tcrypto.SIGNATURE_SIZE),
        encrypted_group_private_encryption_keys_for_users: [],
      };
      expect(() => serializeUserGroupAdditionV1(userGroupAdd)).not.to.throw();
      userGroupAdd[field] = new Uint8Array(0);
      expect(() => serializeUserGroupAdditionV1(userGroupAdd)).to.throw();
    });
  });
});
