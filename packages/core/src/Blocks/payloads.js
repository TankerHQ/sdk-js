// @flow
import varint from 'varint';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { UpgradeRequiredError } from '../errors.internal';
import { getArray, getStaticArray, encodeArrayLength } from './Serialize';

import { type Nature } from './Nature';

export type BlockNoSignature = {|
  trustchain_id: Uint8Array,
  index: number,
  nature: Nature,
  payload: Uint8Array,
  author: Uint8Array,
|}

export type Block = {|
  ...BlockNoSignature,
  signature: Uint8Array,
|};

export const SEALED_KEY_SIZE = tcrypto.SYMMETRIC_KEY_SIZE + tcrypto.SEAL_OVERHEAD;
export const TWO_TIMES_SEALED_KEY_SIZE = SEALED_KEY_SIZE + tcrypto.SEAL_OVERHEAD;

export type TrustchainCreationRecord = {|
  public_signature_key: Uint8Array,
|}

export type ProvisionalPublicKey = {|
  app_public_encryption_key: Uint8Array,
  tanker_public_encryption_key: Uint8Array,
|}

export type Record = TrustchainCreationRecord;

// Warning: When incrementing the block version, make sure to add a block signature to the v2.
const currentVersion = 1;

const hashSize = tcrypto.HASH_SIZE;
const signatureSize = tcrypto.SIGNATURE_SIZE;
const trustchainIdSize = hashSize;

export function serializeBlock(block: Block): Uint8Array {
  if (block.author.length !== hashSize)
    throw new InternalError('Assertion error: invalid block author size');
  if (block.signature.length !== signatureSize)
    throw new InternalError('Assertion error: invalid block signature size');
  if (block.trustchain_id.length !== trustchainIdSize)
    throw new InternalError('Assertion error: invalid block trustchain_id size');

  return utils.concatArrays(
    new Uint8Array(varint.encode(currentVersion)),
    new Uint8Array(varint.encode(block.index)),
    block.trustchain_id,
    new Uint8Array(varint.encode(block.nature)),
    encodeArrayLength(block.payload),
    block.payload,
    block.author,
    block.signature
  );
}

export function unserializeBlock(src: Uint8Array): Block {
  let newOffset = 0;
  let value;
  const version = varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  if (version > currentVersion)
    throw new UpgradeRequiredError(`unsupported block version: ${version}`);
  const index = varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  ({ value, newOffset } = getStaticArray(src, trustchainIdSize, newOffset));
  const trustchain_id = value; // eslint-disable-line camelcase
  value = varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  const nature = value;
  ({ value, newOffset } = getArray(src, newOffset));
  const payload = value;
  ({ value, newOffset } = getStaticArray(src, hashSize, newOffset));
  const author = value;
  ({ value, newOffset } = getStaticArray(src, signatureSize, newOffset));
  const signature = value;

  return { index, trustchain_id, nature, payload, author, signature };
}
