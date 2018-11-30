// @flow
import varint from 'varint';
import { generichash, tcrypto, utils, type Key } from '@tanker/crypto';
import { type Nature } from './Nature';

export type BlockNoSignature = {
  trustchain_id: Uint8Array,
  index: number,
  nature: Nature,
  payload: Uint8Array,
  author: Uint8Array,
};

export type Block = {|
  trustchain_id: Uint8Array,
  index: number,
  nature: Nature,
  payload: Uint8Array,
  author: Uint8Array,
  signature: Uint8Array,
|};

function natureToVarint(nature: number): Uint8Array {
  const out = new Uint8Array(8);
  varint.encode(nature, out, 0);
  return out.subarray(0, varint.encode.bytes);
}

// computes the hash of a raw trustchain block, which we use to identify blocks
export function hashBlock(block: Block | BlockNoSignature): Uint8Array {
  const fullPayload = utils.concatArrays(utils.concatArrays(natureToVarint(block.nature), block.author), block.payload);
  return generichash(fullPayload);
}

export function signBlock(block: BlockNoSignature, privSignKey: Key): Block {
  const hash = hashBlock(block);
  const newBlock: Block = {
    ...block,
    signature: tcrypto.sign(hash, privSignKey),
  };
  return newBlock;
}
