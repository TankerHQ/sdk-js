// @flow
import { tcrypto, utils, obfuscateUserId, createUserSecretB64, type b64string } from '@tanker/crypto';

import { InvalidIdentity } from './InvalidIdentity';

export { InvalidIdentity };

type KeyPair = {|
  public_key: b64string,
  private_key: b64string,
|};

type PreshareKeys = {|
  encryption_key_pair: KeyPair,
  signature_key_pair: KeyPair,
|};

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

export type SecretProvisionalIdentity = {|
  trustchain_id: b64string,
  target: ProvisionalIdentityTarget,
  value: string,
  ...PreshareKeys,
|};

export type PublicProvisionalIdentity = {|
  trustchain_id: b64string,
  target: ProvisionalIdentityTarget,
  value: string,
  public_signature_key: b64string,
  public_encryption_key: b64string,
|};

export type SecretIdentity = SecretPermanentIdentity | SecretProvisionalIdentity;
export type PublicIdentity = PublicPermanentIdentity | PublicProvisionalIdentity;

function generatePreshareKeys(): PreshareKeys {
  const encryptionKeys = tcrypto.makeEncryptionKeyPair();
  const signatureKeys = tcrypto.makeSignKeyPair();

  return {
    encryption_key_pair: {
      public_key: utils.toBase64(encryptionKeys.publicKey),
      private_key: utils.toBase64(encryptionKeys.privateKey),
    },
    signature_key_pair: {
      public_key: utils.toBase64(signatureKeys.publicKey),
      private_key: utils.toBase64(signatureKeys.privateKey),
    },
  };
}

function _serializeIdentity(identity: SecretIdentity | PublicIdentity): b64string { // eslint-disable-line no-underscore-dangle
  return utils.toB64Json(identity);
}

export function _deserializeIdentity(identity: b64string): SecretIdentity { // eslint-disable-line no-underscore-dangle
  try {
    return utils.fromB64Json(identity);
  } catch (e) {
    throw new InvalidIdentity(e);
  }
}

export function _deserializePermanentIdentity(identity: b64string): SecretPermanentIdentity { // eslint-disable-line no-underscore-dangle
  let result;

  try {
    result = utils.fromB64Json(identity);
  } catch (e) {
    throw new InvalidIdentity(e);
  }

  if (result.target !== 'user')
    throw new InvalidIdentity(`Expected an identity, but contained target "${result.target}"`);

  return result;
}

export function _deserializeProvisionalIdentity(identity: b64string): SecretProvisionalIdentity { // eslint-disable-line no-underscore-dangle
  let result;

  try {
    result = utils.fromB64Json(identity);
  } catch (e) {
    throw new InvalidIdentity(e);
  }

  if (result.target !== 'email')
    throw new InvalidIdentity(`Expected a provisional identity, but contained target "${result.target}"`);

  return result;
}

export function _deserializePublicIdentity(identity: b64string): PublicIdentity { // eslint-disable-line no-underscore-dangle
  try {
    return utils.fromB64Json(identity);
  } catch (e) {
    throw new InvalidIdentity(e);
  }
}

export async function createIdentity(trustchainId: b64string, trustchainPrivateKey: b64string, userId: string): Promise<b64string> {
  const obfuscatedUserId = obfuscateUserId(utils.fromBase64(trustchainId), userId);

  const ephemeralKeyPair = tcrypto.makeSignKeyPair();

  const toSign = utils.concatArrays(ephemeralKeyPair.publicKey, obfuscatedUserId);
  const delegationSignature = tcrypto.sign(toSign, utils.fromBase64(trustchainPrivateKey));

  const userSecret = createUserSecretB64(trustchainId, userId);

  return _serializeIdentity({
    trustchain_id: trustchainId,
    target: 'user',
    value: utils.toBase64(obfuscatedUserId),
    delegation_signature: utils.toBase64(delegationSignature),
    ephemeral_public_signature_key: utils.toBase64(ephemeralKeyPair.publicKey),
    ephemeral_private_signature_key: utils.toBase64(ephemeralKeyPair.privateKey),
    user_secret: userSecret
  });
}

export async function createProvisionalIdentity(email: string, trustchainId: b64string): Promise<b64string> {
  const provisionalIdentity: SecretProvisionalIdentity = {
    trustchain_id: trustchainId,
    target: 'email',
    value: email,
    ...generatePreshareKeys(),
  };
  return _serializeIdentity(provisionalIdentity);
}

// Note: tankerIdentity is a Tanker identity created by either createIdentity() or createProvisionalIdentity()
export async function getPublicIdentity(tankerIdentity: b64string): Promise<b64string> {
  const identity = _deserializeIdentity(tankerIdentity);

  if (identity.target === 'user') {
    const { trustchain_id, target, value } = identity; // eslint-disable-line camelcase
    return _serializeIdentity({ trustchain_id, target, value });
  }

  if (identity.encryption_key_pair && identity.signature_key_pair) {
    return _serializeIdentity({
      trustchain_id: identity.trustchain_id,
      target: identity.target,
      value: identity.value,
      public_signature_key: identity.signature_key_pair.public_key,
      public_encryption_key: identity.encryption_key_pair.public_key,
    });
  }

  throw new InvalidIdentity('Invalid Tanker identity provided');
}

// Note: userToken generated with the deprecated @tanker/user-token sdk
/* eslint-disable camelcase */
export async function upgradeUserToken(trustchainId: b64string, userId: string, userToken: b64string): Promise<b64string> {
  const obfuscatedUserId = obfuscateUserId(utils.fromBase64(trustchainId), userId);
  const {
    delegation_signature,
    ephemeral_public_signature_key,
    ephemeral_private_signature_key,
    user_id,
    user_secret,
  } = utils.fromB64Json(userToken);

  if (utils.toBase64(obfuscatedUserId) !== user_id)
    throw new InvalidIdentity('Invalid userId provided');

  return _serializeIdentity({
    trustchain_id: trustchainId,
    target: 'user',
    value: user_id,
    delegation_signature,
    ephemeral_public_signature_key,
    ephemeral_private_signature_key,
    user_secret,
  });
}
/* eslint-enable */
