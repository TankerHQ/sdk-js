import type { b64string } from '@tanker/crypto';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';

type PermanentIdentityTarget = 'user';
type SecretProvisionalIdentityTarget = 'email' | 'phone_number';
export type PublicProvisionalIdentityTarget = 'email' | 'hashed_email' | 'hashed_phone_number';

export type PublicPermanentIdentity = {
  trustchain_id: b64string;
  target: PermanentIdentityTarget;
  value: b64string;
};

export type SecretPermanentIdentity = PublicPermanentIdentity & {
  ephemeral_public_signature_key: b64string;
  ephemeral_private_signature_key: b64string;
  delegation_signature: b64string;
  user_secret: b64string;
};

type ProvisionalIdentityBase = {
  trustchain_id: b64string;
  value: string;
  public_signature_key: b64string;
  public_encryption_key: b64string;
};

export type PublicProvisionalIdentity = ProvisionalIdentityBase & {
  target: PublicProvisionalIdentityTarget;
};

export type SecretProvisionalIdentity = ProvisionalIdentityBase & {
  target: SecretProvisionalIdentityTarget;
  private_encryption_key: b64string;
  private_signature_key: b64string;
};

export type PublicProvisionalUser = {
  trustchainId: Uint8Array;
  target: string;
  value: string;
  appSignaturePublicKey: Uint8Array;
  appEncryptionPublicKey: Uint8Array;
  tankerSignaturePublicKey: Uint8Array;
  tankerEncryptionPublicKey: Uint8Array;
};

export type ProvisionalUserKeys = {
  appSignatureKeyPair: tcrypto.SodiumKeyPair;
  appEncryptionKeyPair: tcrypto.SodiumKeyPair;
  tankerSignatureKeyPair: tcrypto.SodiumKeyPair;
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair;
};

export type SecretIdentity = SecretPermanentIdentity | SecretProvisionalIdentity;
export type PublicIdentity = PublicPermanentIdentity | PublicProvisionalIdentity;

function isPermanentIdentity(identity: SecretIdentity | PublicIdentity): boolean {
  return identity.target === 'user';
}

function isPublicPermanentIdentity(identity: SecretPermanentIdentity | PublicPermanentIdentity): boolean {
  return !('user_secret' in identity);
}

export function isProvisionalIdentity(identity: SecretIdentity | PublicIdentity): boolean {
  return !isPermanentIdentity(identity);
}

export function identityTargetToVerificationMethodType(target: SecretProvisionalIdentityTarget): string {
  switch (target) {
    case 'email': return 'email';
    case 'phone_number': return 'phoneNumber';
    default: throw new InternalError('Assertion error: unknown provisional identity target');
  }
}

const rubyJsonOrder: Record<string, number> = {
  trustchain_id: 1,
  target: 2,
  value: 3,
  delegation_signature: 4,
  ephemeral_public_signature_key: 5,
  ephemeral_private_signature_key: 6,
  user_secret: 7,
  public_encryption_key: 8,
  private_encryption_key: 9,
  public_signature_key: 10,
  private_signature_key: 11,
};

function rubyJsonSort(a: string, b: string) {
  const aIdx = rubyJsonOrder[a];
  const bIdx = rubyJsonOrder[b];
  if (!aIdx)
    throw new InternalError(`Assertion error: unknown identity JSON key: ${a}`);
  if (!bIdx)
    throw new InternalError(`Assertion error: unknown identity JSON key: ${b}`);
  return aIdx - bIdx;
}

function dumpOrderedJson(o: Record<string, any>): string {
  const keys = Object.keys(o).sort(rubyJsonSort);
  const json = [];

  for (const k of keys) {
    let val;
    if (o[k] !== null && typeof o[k] === 'object') {
      val = dumpOrderedJson(o[k]);
    } else {
      val = JSON.stringify(o[k]);
    }
    json.push(`"${k}":${val}`);
  }

  return `{${json.join(',')}}`;
}

export function _serializeIdentity(identity: SecretIdentity | PublicIdentity): b64string { // eslint-disable-line no-underscore-dangle
  return utils.toBase64(utils.fromString(dumpOrderedJson(identity)));
}

function _deserializeAndFreeze(identity: b64string): Record<string, any> { // eslint-disable-line no-underscore-dangle
  const result = utils.fromB64Json(identity);
  // Hidden property that carries the original serialized version of the
  // identity for debugging purposes (e.g. error messages)
  Object.defineProperty(result, 'serializedIdentity', {
    value: identity,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return Object.freeze(result);
}

export function _deserializePermanentIdentity(identity: b64string): SecretPermanentIdentity { // eslint-disable-line no-underscore-dangle
  let result: SecretPermanentIdentity;

  try {
    result = _deserializeAndFreeze(identity) as any;
  } catch (e) {
    throw new InvalidArgument(`Invalid secret permanent identity provided: ${identity}`);
  }

  if (!isPermanentIdentity(result))
    throw new InvalidArgument(`Expected a secret permanent identity, but got provisional identity with target: "${result.target}"`);

  if (isPublicPermanentIdentity(result))
    throw new InvalidArgument(`Expected a secret permanent identity, but got a public permanent identity: ${identity}"`);

  return result;
}

export function _deserializeProvisionalIdentity(identity: b64string): SecretProvisionalIdentity { // eslint-disable-line no-underscore-dangle
  let result: SecretProvisionalIdentity;

  try {
    result = _deserializeAndFreeze(identity) as any;
  } catch (e) {
    throw new InvalidArgument(`Invalid provisional identity provided: ${identity}`);
  }

  if (!isProvisionalIdentity(result))
    throw new InvalidArgument(`Expected a provisional identity, but contained target "${result.target}"`);

  return result;
}

export function _deserializePublicIdentity(identity: b64string): PublicIdentity { // eslint-disable-line no-underscore-dangle
  try {
    return _deserializeAndFreeze(identity) as any;
  } catch (e) {
    throw new InvalidArgument(`Invalid public identity provided: ${identity}`);
  }
}

export function _splitProvisionalAndPermanentPublicIdentities(identities: Array<PublicIdentity>) { // eslint-disable-line no-underscore-dangle
  const permanentIdentities: Array<PublicPermanentIdentity> = [];
  const provisionalIdentities: Array<PublicProvisionalIdentity> = [];

  for (const identity of identities) {
    if (isPermanentIdentity(identity)) {
      // Check that the permanent identities are not secret permanent identities
      if ('user_secret' in identity) {
        throw new InvalidArgument('unexpected secret identity, only public identities are allowed');
      }

      permanentIdentities.push(identity as PublicPermanentIdentity);
    } else {
      // Check that the provisional identities are not secret provisional identities
      if ('private_encryption_key' in identity) {
        throw new InvalidArgument('unexpected secret identity, only public identities are allowed');
      }

      provisionalIdentities.push(identity as PublicProvisionalIdentity);
    }
  }

  return { permanentIdentities, provisionalIdentities };
}
