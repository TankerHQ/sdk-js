// @flow

import { tcrypto, utils } from '@tanker/crypto';

import { InvalidBlockError } from '../errors.internal';
import type {
  UnverifiedTrustchainCreation,
  UnverifiedProvisionalIdentityClaim,
  VerifiedProvisionalIdentityClaim,
} from '../Blocks/entries';

import { type Device } from '../Users/types';
import {
  isTrustchainCreation,
} from '../Blocks/Nature';

export const rootBlockAuthor = new Uint8Array(32);

export function verifyTrustchainCreation(trustchainCreation: UnverifiedTrustchainCreation, trustchainId: Uint8Array) {
  if (!isTrustchainCreation(trustchainCreation.nature))
    throw new InvalidBlockError('invalid_nature', 'invalid nature for trustchain creation', { trustchainCreation });

  if (!utils.equalArray(trustchainCreation.author, rootBlockAuthor))
    throw new InvalidBlockError('invalid_author_for_trustchain_creation', 'author of trustchain_creation must be 0', { trustchainCreation });

  if (!utils.isNullArray(trustchainCreation.signature))
    throw new InvalidBlockError('invalid_signature', 'signature must be 0', { trustchainCreation });

  if (!utils.equalArray(trustchainCreation.hash, trustchainId))
    throw new InvalidBlockError('invalid_root_block', 'the root block does not correspond to this trustchain', { trustchainCreation, trustchainId });
}

export function verifyProvisionalIdentityClaim(entry: UnverifiedProvisionalIdentityClaim, author: Device, authorUserId: Uint8Array): VerifiedProvisionalIdentityClaim {
  if (!utils.equalArray(entry.user_id, authorUserId))
    throw new InvalidBlockError('invalid_author', 'Claim provisional identity author does not match claimed user ID', { entry, authorUserId });

  if (!tcrypto.verifySignature(entry.hash, entry.signature, author.devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry, author });

  const multiSignedPayload = utils.concatArrays(
    author.deviceId,
    entry.app_provisional_identity_signature_public_key,
    entry.tanker_provisional_identity_signature_public_key,
  );
  if (!tcrypto.verifySignature(multiSignedPayload, entry.author_signature_by_app_key, entry.app_provisional_identity_signature_public_key))
    throw new InvalidBlockError('invalid_signature', 'app signature is invalid', { entry, author });

  if (!tcrypto.verifySignature(multiSignedPayload, entry.author_signature_by_tanker_key, entry.tanker_provisional_identity_signature_public_key))
    throw new InvalidBlockError('invalid_signature', 'tanker signature is invalid', { entry, author });

  return (entry: VerifiedProvisionalIdentityClaim);
}
