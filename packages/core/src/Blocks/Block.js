// @flow
import varint from 'varint';
import { generichash, tcrypto, utils } from '@tanker/crypto';
import { type Nature } from './Nature';

import { type Block, type BlockNoSignature, serializeBlock } from './payloads';

export type VerificationFields = {|
  nature: Nature,
  author: Uint8Array,
  hash: Uint8Array,
  signature: Uint8Array
|};

function natureToVarint(nature: Nature): Uint8Array {
  const out = new Uint8Array(8);
  varint.encode(nature, out, 0);
  return out.subarray(0, varint.encode.bytes);
}

// computes the hash of a raw trustchain block, which we use to identify blocks
export function hashBlock(block: Block | BlockNoSignature): Uint8Array {
  const fullPayload = utils.concatArrays(natureToVarint(block.nature), block.author, block.payload);
  return generichash(fullPayload);
}

export function createBlock(payload: Uint8Array, nature: Nature, trustchainId: Uint8Array, author: Uint8Array, signatureKey: Uint8Array) {
  const block = {
    trustchain_id: trustchainId,
    nature,
    author,
    payload
  };
  const hash = hashBlock(block);
  const signature = tcrypto.sign(hash, signatureKey);

  return { block: utils.toBase64(serializeBlock({ ...block, signature })), hash };
}
