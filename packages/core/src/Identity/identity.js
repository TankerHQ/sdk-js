// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';

type PermanentIdentityTarget = 'user';
type SecretProvisionalIdentityTarget = 'email';
type PublicProvisionalIdentityTarget = 'email' | 'hashed_email';

export type PublicPermanentIdentity = {|
  trustchain_id: b64string,
  target: PermanentIdentityTarget,
  value: b64string,
|};

export type SecretPermanentIdentity = {|
  ...PublicPermanentIdentity,
  ephemeral_public_signature_key: b64string,
  ephemeral_private_signature_key: b64string,
  delegation_signature: b64string,
  user_secret: b64string,
|};

export type PublicProvisionalIdentity = {|
  trustchain_id: b64string,
  target: PublicProvisionalIdentityTarget,
  value: string,
  public_signature_key: b64string,
  public_encryption_key: b64string,
|};

export type SecretProvisionalIdentity = {|
  ...PublicProvisionalIdentity,
  target: SecretProvisionalIdentityTarget,
  private_encryption_key: b64string,
  private_signature_key: b64string,
|};

export type PublicProvisionalUser = {|
  trustchainId: Uint8Array,
  target: string,
  value: string,
  appSignaturePublicKey: Uint8Array,
  appEncryptionPublicKey: Uint8Array,
  tankerSignaturePublicKey: Uint8Array,
  tankerEncryptionPublicKey: Uint8Array,
|};

export type ProvisionalUserKeys = {|
  appSignatureKeyPair: tcrypto.SodiumKeyPair,
  appEncryptionKeyPair: tcrypto.SodiumKeyPair,
  tankerSignatureKeyPair: tcrypto.SodiumKeyPair,
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair,
|};

export type SecretIdentity = SecretPermanentIdentity | SecretProvisionalIdentity;
export type PublicIdentity = PublicPermanentIdentity | PublicProvisionalIdentity;

function isPermanentIdentity(identity: SecretIdentity | PublicIdentity): bool %checks {
  return identity.target === 'user';
}

function isPublicPermanentIdentity(identity: SecretPermanentIdentity | PublicPermanentIdentity): bool %checks {
  return !('user_secret' in identity);
}

function isProvisionalIdentity(identity: SecretIdentity | PublicIdentity): bool %checks {
  return !isPermanentIdentity(identity);
}

function _deserializeAndFreeze(identity: b64string): Object { // eslint-disable-line no-underscore-dangle
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

export function _deserializeIdentity(identity: b64string): SecretIdentity { // eslint-disable-line no-underscore-dangle
  try {
    return _deserializeAndFreeze(identity);
  } catch (e) {
    throw new InvalidArgument(`Invalid identity provided: ${identity}`);
  }
}

export function _deserializePermanentIdentity(identity: b64string): SecretPermanentIdentity { // eslint-disable-line no-underscore-dangle
  let result;

  try {
    result = _deserializeAndFreeze(identity);
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
  let result;

  try {
    result = _deserializeAndFreeze(identity);
  } catch (e) {
    throw new InvalidArgument(`Invalid provisional identity provided: ${identity}`);
  }

  if (!isProvisionalIdentity(result))
    throw new InvalidArgument(`Expected a provisional identity, but contained target "${result.target}"`);

  return result;
}

export function _deserializePublicIdentity(identity: b64string): PublicIdentity { // eslint-disable-line no-underscore-dangle
  try {
    return _deserializeAndFreeze(identity);
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

      permanentIdentities.push(identity);
    } else {
      // Check that the provisional identities are not secret provisional identities
      if ('private_encryption_key' in identity) {
        throw new InvalidArgument('unexpected secret identity, only public identities are allowed');
      }

      provisionalIdentities.push(identity);
    }
  }

  return { permanentIdentities, provisionalIdentities };
}
