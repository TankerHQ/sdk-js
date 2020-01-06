// @flow

import { tcrypto, utils } from '@tanker/crypto';

import { InvalidBlockError } from '../errors.internal';
import type { ClaimEntry } from './Serialize';

export function verifyProvisionalIdentityClaim(entry: ClaimEntry, devicePublicSignatureKey: Uint8Array, authorUserId: Uint8Array) {
  if (!utils.equalArray(entry.user_id, authorUserId))
    throw new InvalidBlockError('invalid_author', 'Claim provisional identity author does not match claimed user ID', { entry, authorUserId });

  if (!tcrypto.verifySignature(entry.hash, entry.signature, devicePublicSignatureKey))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', entry);

  const multiSignedPayload = utils.concatArrays(
    entry.device_id,
    entry.app_provisional_identity_signature_public_key,
    entry.tanker_provisional_identity_signature_public_key,
  );
  if (!tcrypto.verifySignature(multiSignedPayload, entry.author_signature_by_app_key, entry.app_provisional_identity_signature_public_key))
    throw new InvalidBlockError('invalid_signature', 'app signature is invalid', entry);

  if (!tcrypto.verifySignature(multiSignedPayload, entry.author_signature_by_tanker_key, entry.tanker_provisional_identity_signature_public_key))
    throw new InvalidBlockError('invalid_signature', 'tanker signature is invalid', entry);
}
