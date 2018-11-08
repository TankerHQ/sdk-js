// @flow

import { utils } from '@tanker/crypto';
import {
  type Nature,
  type Record,
  unserializePayload,
} from './payloads';


import {
  type Block,
  hashBlock,
} from '../Blocks/Block';


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

export function entryToDbEntry(entry: UnverifiedEntry, id: any): any {
  const result = internalEntryToDbEntry(entry);
  result._id = id; // eslint-disable-line no-underscore-dangle
  return result;
}

export function dbEntryToEntry(dbEntry: any): any {
  const result = {};
  Object.entries(dbEntry).forEach(elem => {
    if (elem[0] === '_id' || elem[1] == null) {
      return;
    }
    // We don't have real strings for now.
    if (typeof elem[1] === 'string') {
      result[elem[0]] = utils.fromBase64(elem[1]);
    } else if (Array.isArray(elem[1])) {
      result[elem[0]] = elem[1].map(dbEntryToEntry);
    } else if (typeof elem[1] === 'object') {
      result[elem[0]] = dbEntryToEntry(elem[1]);
    } else {
      result[elem[0]] = elem[1]; // eslint-disable-line prefer-destructuring
    }
  });
  return result;
}

export function blockToEntry(block: Block): UnverifiedEntry { /* eslint-disable camelcase */
  const payload_unverified = unserializePayload(block);
  // $FlowFixMe flow is right, Record may or may not contain any of these fields
  const { user_id, public_signature_key } = payload_unverified;
  const { index, author, nature, signature } = block;

  const typeSafeNature: Nature = (nature: any);

  return {
    payload_unverified,
    index,
    nature: typeSafeNature,
    author,
    public_signature_key,
    user_id,
    signature,
    hash: hashBlock(block),
  };
}
