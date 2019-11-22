// @flow

import { tcrypto, utils } from '@tanker/crypto';

import { InvalidBlockError } from '../../errors.internal';
import type { ClaimEntry } from './Serialize';

import { type Device } from '../../Users/types';


export function verifyProvisionalIdentityClaim(entry: ClaimEntry, author: Device, authorUserId: Uint8Array) {
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
}
