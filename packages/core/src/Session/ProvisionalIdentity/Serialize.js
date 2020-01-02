// @flow

import { type ProvisionalUserKeys } from '@tanker/identity';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { preferredNature, NATURE_KIND } from '../../Blocks/Nature';

import { type VerificationFields, hashBlock } from '../../Blocks/Block';
import { getStaticArray, unserializeGeneric } from '../../Blocks/Serialize';
import { unserializeBlock } from '../../Blocks/payloads';


export type ProvisionalIdentityClaimRecord = {|
  user_id: Uint8Array,
  app_provisional_identity_signature_public_key: Uint8Array,
  tanker_provisional_identity_signature_public_key: Uint8Array,
  author_signature_by_app_key: Uint8Array,
  author_signature_by_tanker_key: Uint8Array,
  recipient_user_public_key: Uint8Array,
  encrypted_provisional_identity_private_keys: Uint8Array,
|}

export type ClaimEntry = {|
  ...ProvisionalIdentityClaimRecord,
  ...VerificationFields,
  device_id: Uint8Array
|}

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

export function provisionalIdentityClaimFromBlock(b64Block: string): ClaimEntry {
  const block = unserializeBlock(utils.fromBase64(b64Block));
  const author = block.author;
  const signature = block.signature;
  const nature = block.nature;
  const hash = hashBlock(block);
  const claimEntry = unserializeProvisionalIdentityClaim(block.payload);

  return {
    ...claimEntry,
    author,
    signature,
    nature,
    hash,
    device_id: block.author,
  };
}


export const makeProvisionalIdentityClaim = (userId: Uint8Array, deviceId: Uint8Array, userPublicKey: Uint8Array, provisionalUserKeys: ProvisionalUserKeys) => {
  const multiSignedPayload = utils.concatArrays(
    deviceId,
    provisionalUserKeys.appSignatureKeyPair.publicKey,
    provisionalUserKeys.tankerSignatureKeyPair.publicKey,
  );
  const appSignature = tcrypto.sign(multiSignedPayload, provisionalUserKeys.appSignatureKeyPair.privateKey);
  const tankerSignature = tcrypto.sign(multiSignedPayload, provisionalUserKeys.tankerSignatureKeyPair.privateKey);

  const keysToEncrypt = utils.concatArrays(provisionalUserKeys.appEncryptionKeyPair.privateKey, provisionalUserKeys.tankerEncryptionKeyPair.privateKey);
  const encryptedprovisionalUserKeys = tcrypto.sealEncrypt(keysToEncrypt, userPublicKey);

  const payload = {
    user_id: userId,
    app_provisional_identity_signature_public_key: provisionalUserKeys.appSignatureKeyPair.publicKey,
    tanker_provisional_identity_signature_public_key: provisionalUserKeys.tankerSignatureKeyPair.publicKey,
    author_signature_by_app_key: appSignature,
    author_signature_by_tanker_key: tankerSignature,
    recipient_user_public_key: userPublicKey,
    encrypted_provisional_identity_private_keys: encryptedprovisionalUserKeys,
  };

  return { payload: serializeProvisionalIdentityClaim(payload), nature: preferredNature(NATURE_KIND.provisional_identity_claim) };
};
