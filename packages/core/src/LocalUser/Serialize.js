// @flow
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { getStaticArray } from '../Blocks/Serialize';
import { NATURE } from '../Blocks/Nature';
import { unserializeBlock } from '../Blocks/payloads';
import { type VerificationFields, hashBlock } from '../Blocks/Block';

export type TrustchainCreationRecord = {|
  public_signature_key: Uint8Array,
|};

export type TrustchainCreationEntry = {|
  ...TrustchainCreationRecord,
  ...VerificationFields
|};

export function serializeTrustchainCreation(trustchainCreation: TrustchainCreationRecord): Uint8Array {
  if (trustchainCreation.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid trustchain public key size');

  return trustchainCreation.public_signature_key;
}

export function unserializeTrustchainCreation(src: Uint8Array): TrustchainCreationRecord {
  const { value } = getStaticArray(src, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, 0);
  return { public_signature_key: value };
}

export function trustchainCreationFromBlock(b64Block: string): TrustchainCreationEntry {
  const block = unserializeBlock(utils.fromBase64(b64Block));
  const author = block.author;
  const signature = block.signature;
  const nature = block.nature;
  const hash = hashBlock(block);

  if (block.nature !== NATURE.trustchain_creation) {
    throw new InternalError(`Assertion error: invalid block nature ${block.nature} for trustchainCreationFromBlock`);
  }

  const trustchainCreationRecord = unserializeTrustchainCreation(block.payload);
  return { ...trustchainCreationRecord, author, signature, nature, hash };
}
