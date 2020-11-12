// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';

import { obfuscateUserId } from './userId';
import { createUserSecretB64 } from './userSecret';

type PermanentIdentityTarget = 'user';
type ProvisionalIdentityTarget = 'email';

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
  target: ProvisionalIdentityTarget,
  value: string,
  public_signature_key: b64string,
  public_encryption_key: b64string,
|};

export type SecretProvisionalIdentity = {|
  ...PublicProvisionalIdentity,
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

function isPermanentIdentity(identity: SecretIdentity | PublicIdentity): %checks {
  return identity.target === 'user';
}

function isPublicPermanentIdentity(identity: SecretPermanentIdentity | PublicPermanentIdentity): %checks {
  return !('user_secret' in identity);
}

function isProvisionalIdentity(identity: SecretIdentity | PublicIdentity): %checks {
  return identity.target === 'email';
}

export function _serializeIdentity(identity: SecretIdentity | PublicIdentity): b64string { // eslint-disable-line no-underscore-dangle
  return utils.toB64Json(identity);
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

function _generateAppId(appSecret: Uint8Array): b64string { // eslint-disable-line no-underscore-dangle
  const publicKey = appSecret.subarray(tcrypto.SIGNATURE_PRIVATE_KEY_SIZE - tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, tcrypto.SIGNATURE_PRIVATE_KEY_SIZE);
  return utils.toBase64(utils.generateAppID(publicKey));
}

export async function createIdentity(appId: b64string, appSecret: b64string, userId: string): Promise<b64string> {
  if (!appId || typeof appId !== 'string')
    throw new InvalidArgument('appId', 'b64string', appId);
  if (!appSecret || typeof appSecret !== 'string')
    throw new InvalidArgument('appSecret', 'b64string', appSecret);
  if (!userId || typeof userId !== 'string')
    throw new InvalidArgument('userId', 'string', userId);
  const obfuscatedUserId = obfuscateUserId(utils.fromBase64(appId), userId);

  const appSecretBytes = utils.fromBase64(appSecret);
  const gerenatedAppId = _generateAppId(appSecretBytes);
  if (gerenatedAppId !== appId)
    throw new InvalidArgument('app secret and app ID mismatch');

  const ephemeralKeyPair = tcrypto.makeSignKeyPair();

  const toSign = utils.concatArrays(ephemeralKeyPair.publicKey, obfuscatedUserId);
  const delegationSignature = tcrypto.sign(toSign, appSecretBytes);

  const userSecret = createUserSecretB64(appId, userId);

  const permanentIdentity: SecretPermanentIdentity = {
    trustchain_id: appId,
    target: 'user',
    value: utils.toBase64(obfuscatedUserId),
    delegation_signature: utils.toBase64(delegationSignature),
    ephemeral_public_signature_key: utils.toBase64(ephemeralKeyPair.publicKey),
    ephemeral_private_signature_key: utils.toBase64(ephemeralKeyPair.privateKey),
    user_secret: userSecret
  };

  return _serializeIdentity(permanentIdentity);
}

export async function createProvisionalIdentity(appId: b64string, email: string): Promise<b64string> {
  if (!appId || typeof appId !== 'string')
    throw new InvalidArgument('appId', 'b64string', appId);
  if (!email || typeof email !== 'string')
    throw new InvalidArgument('email', 'string', email);
  const encryptionKeys = tcrypto.makeEncryptionKeyPair();
  const signatureKeys = tcrypto.makeSignKeyPair();

  const provisionalIdentity: SecretProvisionalIdentity = {
    trustchain_id: appId,
    target: 'email',
    value: email,
    public_encryption_key: utils.toBase64(encryptionKeys.publicKey),
    private_encryption_key: utils.toBase64(encryptionKeys.privateKey),
    public_signature_key: utils.toBase64(signatureKeys.publicKey),
    private_signature_key: utils.toBase64(signatureKeys.privateKey),
  };

  return _serializeIdentity(provisionalIdentity);
}

// Note: tankerIdentity is a Tanker identity created by either createIdentity() or createProvisionalIdentity()
export async function getPublicIdentity(tankerIdentity: b64string): Promise<b64string> {
  if (!tankerIdentity || typeof tankerIdentity !== 'string')
    throw new InvalidArgument('tankerIdentity', 'b64string', tankerIdentity);
  const identity = _deserializeIdentity(tankerIdentity);

  if (isPermanentIdentity(identity)) {
    const { trustchain_id, target, value } = identity; // eslint-disable-line camelcase
    return _serializeIdentity({ trustchain_id, target, value });
  }

  if (identity.public_signature_key && identity.public_encryption_key) {
    const { trustchain_id, target, value, public_signature_key, public_encryption_key } = identity; // eslint-disable-line camelcase
    return _serializeIdentity({ trustchain_id, target, value, public_signature_key, public_encryption_key });
  }

  throw new InvalidArgument(`Invalid secret identity provided: ${tankerIdentity}`);
}
