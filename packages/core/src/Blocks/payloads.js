// @flow
import varint from 'varint';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { type Block } from './Block';
import { NATURE } from './Nature';
import { UpgradeRequiredError } from '../errors.internal';
import { getArray, getStaticArray, encodeArrayLength, unserializeGeneric } from './Serialize';

export const SEALED_KEY_SIZE = tcrypto.SYMMETRIC_KEY_SIZE + tcrypto.SEAL_OVERHEAD;
export const TWO_TIMES_SEALED_KEY_SIZE = SEALED_KEY_SIZE + tcrypto.SEAL_OVERHEAD;

export type TrustchainCreationRecord = {|
  public_signature_key: Uint8Array,
|}

export type ProvisionalPublicKey = {|
  app_public_encryption_key: Uint8Array,
  tanker_public_encryption_key: Uint8Array,
|}

export type ProvisionalIdentityClaimRecord = {|
  user_id: Uint8Array,
  app_provisional_identity_signature_public_key: Uint8Array,
  tanker_provisional_identity_signature_public_key: Uint8Array,
  author_signature_by_app_key: Uint8Array,
  author_signature_by_tanker_key: Uint8Array,
  recipient_user_public_key: Uint8Array,
  encrypted_provisional_identity_private_keys: Uint8Array,
|}

export type Record = TrustchainCreationRecord | ProvisionalIdentityClaimRecord |
                      ProvisionalIdentityClaimRecord;

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

export function serializeTrustchainCreation(trustchainCreation: TrustchainCreationRecord): Uint8Array {
  if (trustchainCreation.public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid trustchain public key size');

  return trustchainCreation.public_signature_key;
}

export function unserializeTrustchainCreation(src: Uint8Array): TrustchainCreationRecord {
  const { value } = getStaticArray(src, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, 0);
  return { public_signature_key: value };
}


export function serializeProvisionalIdentityClaim(provisionalIdentityClaim: ProvisionalIdentityClaimRecord): Uint8Array {
  if (provisionalIdentityClaim.user_id.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid claim provisional user id size');
  if (provisionalIdentityClaim.app_provisional_identity_signature_public_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid claim provisional app public key size');
  if (provisionalIdentityClaim.tanker_provisional_identity_signature_public_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid claim provisional tanker public key size');
  if (provisionalIdentityClaim.author_signature_by_app_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid claim provisional app signature size');
  if (provisionalIdentityClaim.author_signature_by_tanker_key.length !== tcrypto.SIGNATURE_SIZE)
    throw new InternalError('Assertion error: invalid claim provisional tanker signature size');
  if (provisionalIdentityClaim.recipient_user_public_key.length !== tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid claim provisional recipient key size');
  if (provisionalIdentityClaim.encrypted_provisional_identity_private_keys.length !== tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE * 2
                                                            + tcrypto.SEAL_OVERHEAD)
    throw new InternalError('Assertion error: invalid claim provisional encrypted keys size');

  return utils.concatArrays(
    provisionalIdentityClaim.user_id,
    provisionalIdentityClaim.app_provisional_identity_signature_public_key,
    provisionalIdentityClaim.tanker_provisional_identity_signature_public_key,
    provisionalIdentityClaim.author_signature_by_app_key,
    provisionalIdentityClaim.author_signature_by_tanker_key,
    provisionalIdentityClaim.recipient_user_public_key,
    provisionalIdentityClaim.encrypted_provisional_identity_private_keys,
  );
}

export function unserializeProvisionalIdentityClaim(src: Uint8Array): ProvisionalIdentityClaimRecord {
  return unserializeGeneric(src, [
    (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'user_id'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'app_provisional_identity_signature_public_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'tanker_provisional_identity_signature_public_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'author_signature_by_app_key'),
    (d, o) => getStaticArray(d, tcrypto.SIGNATURE_SIZE, o, 'author_signature_by_tanker_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'recipient_user_public_key'),
    (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE * 2
                                + tcrypto.SEAL_OVERHEAD, o, 'encrypted_provisional_identity_private_keys'),
  ]);
}

export function unserializePayload(block: Block) {
  switch (block.nature) {
    case NATURE.trustchain_creation: return unserializeTrustchainCreation(block.payload);
    default: throw new UpgradeRequiredError(`unknown nature: ${block.nature}`);
  }
}
