import varint from 'varint';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError, UpgradeRequired } from '@tanker/errors';

import { getArray, getStaticArray, encodeArrayLength } from './Serialize';

import type { Nature } from './Nature';
import { natureExists } from './Nature';

export type BlockNoMetadata = {
  nature: Nature;
  payload: Uint8Array;
};

export type BlockNoSignature = BlockNoMetadata & {
  trustchain_id: Uint8Array;
  author: Uint8Array;
};

export type Block = BlockNoSignature & {
  signature: Uint8Array;
};
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
    new Uint8Array(varint.encode(0)),
    block.trustchain_id,
    new Uint8Array(varint.encode(block.nature)),
    encodeArrayLength(block.payload),
    block.payload,
    block.author,
    block.signature,
  );
}

export function unserializeBlock(src: Uint8Array): Block {
  let newOffset = 0;
  let value;
  const version = varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  if (version > currentVersion)
    throw new UpgradeRequired(`unsupported block version: ${version}`);
  /*const index = */varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  ({ value, newOffset } = getStaticArray(src, trustchainIdSize, newOffset));
  const trustchain_id = value!;
  value = varint.decode(src, newOffset);
  newOffset += varint.decode.bytes;
  const nature = value;
  if (!natureExists(nature))
    throw new UpgradeRequired(`unknown block nature: ${nature}`);
  ({ value, newOffset } = getArray(src, newOffset));
  const payload = value!;
  ({ value, newOffset } = getStaticArray(src, hashSize, newOffset));
  const author = value!;
  ({ value, newOffset } = getStaticArray(src, signatureSize, newOffset));
  const signature = value!;

  return { trustchain_id, nature, payload, author, signature };
}
