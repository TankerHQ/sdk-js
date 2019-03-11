// @flow
import { tcrypto, utils, obfuscateUserId, createUserSecretB64, type b64string } from '@tanker/crypto';

type KeyPair = {|
  public_key: b64string,
  private_key: b64string,
|};

type PreshareKeys = {|
  encryption_key_pair: KeyPair,
  signature_key_pair: KeyPair,
|};

type IdentityTarget = 'user';
type ProvisionalIdentityTarget = 'email';

export type PublicNormalIdentity = {|
  trustchain_id: b64string,
  target: IdentityTarget,
  value: b64string,
|};

export type Identity = {|
  ...PublicNormalIdentity,
  ephemeral_public_signature_key: b64string,
  ephemeral_private_signature_key: b64string,
  delegation_signature: b64string,
  user_secret: b64string,
|};

export type ProvisionalIdentity = {|
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

export type PublicIdentity = PublicNormalIdentity | PublicProvisionalIdentity;

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

export function createIdentity(trustchainId: b64string, trustchainPrivateKey: b64string, userId: string): b64string {
  const obfuscatedUserId = obfuscateUserId(utils.fromBase64(trustchainId), userId);

  const ephemeralKeyPair = tcrypto.makeSignKeyPair();

  const toSign = utils.concatArrays(ephemeralKeyPair.publicKey, obfuscatedUserId);
  const delegationSignature = tcrypto.sign(toSign, utils.fromBase64(trustchainPrivateKey));

  const userSecret = createUserSecretB64(trustchainId, userId);

  return utils.toB64Json({
    trustchain_id: trustchainId,
    target: 'user',
    value: utils.toBase64(obfuscatedUserId),
    delegation_signature: utils.toBase64(delegationSignature),
    ephemeral_public_signature_key: utils.toBase64(ephemeralKeyPair.publicKey),
    ephemeral_private_signature_key: utils.toBase64(ephemeralKeyPair.privateKey),
    user_secret: userSecret
  });
}

export function createProvisionalIdentity(email: string, trustchainId: b64string): b64string {
  const provisionalIdentity: ProvisionalIdentity = {
    trustchain_id: trustchainId,
    target: 'email',
    value: email,
    ...generatePreshareKeys(),
  };
  return utils.toB64Json(provisionalIdentity);
}

// Note: tankerIdentity is a Tanker identity created by either createIdentity() or createProvisionalIdentity()
export function getPublicIdentity(tankerIdentity: b64string): b64string {
  const identity = utils.fromB64Json(tankerIdentity);

  if (identity.target === 'user') {
    const { trustchain_id, target, value } = identity; // eslint-disable-line camelcase
    return utils.toB64Json({ trustchain_id, target, value });
  }

  if (identity.encryption_key_pair && identity.signature_key_pair) {
    return utils.toB64Json({
      trustchain_id: identity.trustchain_id,
      target: identity.target,
      value: identity.value,
      public_signature_key: identity.signature_key_pair.public_key,
      public_encryption_key: identity.encryption_key_pair.public_key,
    });
  }

  throw new Error('Incorrect Tanker identity provided');
}

// Note: userToken generated with the deprecated @tanker/user-token sdk
/* eslint-disable camelcase */
export function upgradeUserToken(trustchainId: b64string, userId: string, userToken: b64string): b64string {
  const obfuscatedUserId = obfuscateUserId(utils.fromBase64(trustchainId), userId);
  const {
    delegation_signature,
    ephemeral_public_signature_key,
    ephemeral_private_signature_key,
    user_id,
    user_secret,
  } = utils.fromB64Json(userToken);

  if (utils.toBase64(obfuscatedUserId) !== user_id)
    throw new Error('Invalid userId provided');

  return utils.toB64Json({
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
