// @flow
import { utils } from '@tanker/crypto';

import {
  type Record,
  unserializePayload,
  unserializeKeyPublish,
  unserializeKeyPublishToDevice,
  unserializeUserDeviceV1,
  unserializeUserDeviceV2,
  unserializeUserDeviceV3,
  unserializeDeviceRevocationV1,
  unserializeDeviceRevocationV2,
  unserializeUserGroupCreation,
  unserializeUserGroupAddition,
  unserializeClaimInvite,
} from './payloads';

import { type Nature, NATURE } from './Nature';
import { type Block, hashBlock } from './Block';

import { type UnverifiedKeyPublish } from '../UnverifiedStore/KeyPublishUnverifiedStore';
import { type UnverifiedUserGroup } from '../UnverifiedStore/UserGroupsUnverifiedStore';
import { type UnverifiedDeviceCreation, type UnverifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { type UnverifiedClaimInvite } from '../UnverifiedStore/InviteUnverifiedStore';


export type VerificationFields = {|
  index: number,
  nature: Nature,
  author: Uint8Array,
  hash: Uint8Array,
  signature: Uint8Array
|}

type BaseEntry = {|
  ...VerificationFields,
  user_id?: Uint8Array,
  resourceId?: Uint8Array,
  public_signature_key?: Uint8Array,
  ephemeral_public_signature_key?: Uint8Array,
  user_public_key?: Uint8Array,
  group_public_encryption_key?: Uint8Array,
  group_id?: Uint8Array,
|}

export type Entry = {|
  ...BaseEntry,
  payload_verified: Record,
|}

export type UnverifiedEntry = {|
  ...BaseEntry,
  payload_unverified: Record,
|}

function internalEntryToDbEntry(entry: any): any {
  let result = {};
  Object.entries(entry).forEach(elem => {
    if (elem[1] instanceof Uint8Array) {
      result[elem[0]] = utils.toBase64(elem[1]);
    } else if (Array.isArray(elem[1])) {
      result[elem[0]] = elem[1].map(internalEntryToDbEntry);
    } else if (elem[0] === 'payload_unverified') {
      result = { ...result, ...internalEntryToDbEntry(elem[1]) };
    } else if (elem[1] && typeof elem[1] === 'object') {
      result[elem[0]] = internalEntryToDbEntry(elem[1]);
    } else if (typeof elem[1] === 'string') {
      throw new Error('Assertion error: string not allowed, see l.72');
    } else {
      result[elem[0]] = elem[1]; // eslint-disable-line prefer-destructuring
    }
  });
  return result;
}

export function entryToDbEntry(entry: any, id: any): any {
  const result = internalEntryToDbEntry(entry);
  result._id = id; // eslint-disable-line no-underscore-dangle
  return result;
}

export function dbEntryToEntry(dbEntry: any): any {
  const result = {};
  Object.entries(dbEntry).forEach(([key, value]) => {
    // Skip '_id' (and '_rev' in PouchDB records)
    if (key[0] === '_' || value == null) {
      return;
    }
    // We don't have real strings for now.
    if (typeof value === 'string') {
      result[key] = utils.fromBase64(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(dbEntryToEntry);
    } else if (typeof value === 'object') {
      result[key] = dbEntryToEntry(value);
    } else {
      result[key] = value; // eslint-disable-line prefer-destructuring
    }
  });
  return result;
}

function verificationFieldsFromBlock(block: Block): VerificationFields {
  const { index, author, nature, signature } = block;
  const typeSafeNature: Nature = (nature: any);

  return {
    index,
    nature: typeSafeNature,
    author,
    signature,
    hash: hashBlock(block),
  };
}

export function blockToEntry(block: Block): UnverifiedEntry { /* eslint-disable camelcase */
  const verificationFields = verificationFieldsFromBlock(block);
  const payload_unverified = unserializePayload(block);
  // $FlowFixMe flow is right, Record may or may not contain any of these fields
  const { user_id, public_signature_key } = payload_unverified;

  return {
    ...verificationFields,
    payload_unverified,
    public_signature_key,
    user_id,
  };
}

export function keyPublishFromBlock(block: Block): UnverifiedKeyPublish {
  const verificationFields = verificationFieldsFromBlock(block);
  let keyPublishAction;
  switch (block.nature) {
    case NATURE.key_publish_to_device:
      keyPublishAction = unserializeKeyPublishToDevice(block.payload);
      break;
    case NATURE.key_publish_to_user:
    case NATURE.key_publish_to_user_group:
    case NATURE.key_publish_to_invitee:
      keyPublishAction = unserializeKeyPublish(block.payload);
      break;
    default: throw new Error('Assertion error: wrong type for keyPublishFromBlock');
  }
  return {
    ...verificationFields,
    ...keyPublishAction
  };
}

export function userGroupEntryFromBlock(block: Block): UnverifiedUserGroup {
  const verificationFields = verificationFieldsFromBlock(block);
  if (block.nature === NATURE.user_group_creation) {
    const userGroupAction = unserializeUserGroupCreation(block.payload);
    return {
      ...verificationFields,
      ...userGroupAction,
      group_id: userGroupAction.public_signature_key
    };
  } else if (block.nature === NATURE.user_group_addition) {
    const userGroupAction = unserializeUserGroupAddition(block.payload);
    return {
      ...verificationFields,
      ...userGroupAction,
    };
  } else {
    throw new Error('Assertion error: wrong type for userGroupEntryFromBlock');
  }
}

export function deviceCreationFromBlock(block: Block): UnverifiedDeviceCreation {
  const verificationFields = verificationFieldsFromBlock(block);
  let userEntry;

  switch (block.nature) {
    case NATURE.device_creation_v1:
      userEntry = unserializeUserDeviceV1(block.payload);
      break;
    case NATURE.device_creation_v2:
      userEntry = unserializeUserDeviceV2(block.payload);
      break;
    case NATURE.device_creation_v3:
      userEntry = unserializeUserDeviceV3(block.payload);
      break;
    default: throw new Error('Assertion error: wrong type for deviceCreationFromBlock');
  }
  return {
    ...verificationFields,
    ...userEntry,
  };
}

export function deviceRevocationFromBlock(block: Block, userId: Uint8Array): UnverifiedDeviceRevocation {
  const verificationFields = verificationFieldsFromBlock(block);
  let userEntry;

  switch (block.nature) {
    case NATURE.device_revocation_v1:
      userEntry = unserializeDeviceRevocationV1(block.payload);
      break;
    case NATURE.device_revocation_v2:
      userEntry = unserializeDeviceRevocationV2(block.payload);
      break;
    default: throw new Error('Assertion error: wrong type for deviceRevocationFromBlock');
  }
  return {
    ...verificationFields,
    ...userEntry,
    user_id: userId
  };
}

export function claimInviteFromBlock(block: Block): UnverifiedClaimInvite {
  const verificationFields = verificationFieldsFromBlock(block);
  let userEntry;

  switch (block.nature) {
    case NATURE.claim_invite:
      userEntry = unserializeClaimInvite(block.payload);
      break;
    default: throw new Error('Assertion error: wrong type for claimInviteFromBlock');
  }
  return {
    ...verificationFields,
    ...userEntry,
  };
}
