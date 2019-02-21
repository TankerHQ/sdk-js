// @flow
import { tcrypto, utils, obfuscateUserId, createUserSecretB64, type b64string } from '@tanker/crypto';

export type UserToken = {|
  ephemeral_public_signature_key: b64string,
  ephemeral_private_signature_key: b64string,
  user_id: b64string,
  delegation_signature: b64string,
  user_secret: b64string,
|};

type KeyPair = {|
  public_key: b64string,
  private_key: b64string,
|};

type PreshareKeys = {|
  encryption_key_pair: KeyPair,
  signature_key_pair: KeyPair,
|};

export type Identity = {|
  ...UserToken,
  trustchain_id: b64string,
|};

export type IdentityTargetType = 'email';

export type ProvisionalIdentity = {|
  trustchain_id: b64string,
  target: IdentityTargetType,
  value: string,
  ...PreshareKeys,
|};

type PublicProvisionalIdentity = {|
  trustchain_id: b64string,
  target: IdentityTargetType,
  value: string,
  public_signature_key: b64string,
  public_encryption_key: b64string,
|}

type PublicNormalIdentity = {|
  trustchain_id: b64string,
  target: 'user',
  value: b64string,
|}

export type PublicIdentity = PublicNormalIdentity | PublicProvisionalIdentity;

function createUserTokenObject(trustchainId: b64string, trustchainPrivateKey: b64string, userId: string): UserToken {
  const obfuscatedUserId = obfuscateUserId(utils.fromBase64(trustchainId), userId);

  const ephemeralKeyPair = tcrypto.makeSignKeyPair();

  const toSign = utils.concatArrays(ephemeralKeyPair.publicKey, obfuscatedUserId);
  const delegationSignature = tcrypto.sign(toSign, utils.fromBase64(trustchainPrivateKey));

  const userSecret = createUserSecretB64(trustchainId, userId);

  return {
    ephemeral_public_signature_key: utils.toBase64(ephemeralKeyPair.publicKey),
    ephemeral_private_signature_key: utils.toBase64(ephemeralKeyPair.privateKey),
    user_id: utils.toBase64(obfuscatedUserId),
    delegation_signature: utils.toBase64(delegationSignature),
    user_secret: userSecret
  };
}

// trustchainId = base64 encoded trustchain id
// trustchainPrivateKey = base64 encoded trustchain private key
// userId = user id, as a string
export function generateUserToken(trustchainId: b64string, trustchainPrivateKey: b64string, userId: string): b64string {
  return utils.toB64Json(
    createUserTokenObject(trustchainId, trustchainPrivateKey, userId)
  );
}

function tankerPreshareKeys(): PreshareKeys {
  const encryptionKeys = tcrypto.makeEncryptionKeyPair();
  const signatureKeys = tcrypto.makeSignKeyPair();
  const keys = {
    encryption_key_pair: {
      public_key: utils.toBase64(encryptionKeys.publicKey),
      private_key: utils.toBase64(encryptionKeys.privateKey),
    },
    signature_key_pair: {
      public_key: utils.toBase64(signatureKeys.publicKey),
      private_key: utils.toBase64(signatureKeys.privateKey),
    },
  };
  return keys;
}

// trustchainId = base64 encoded trustchain id
// trustchainPrivateKey = base64 encoded trustchain private key
// userId = user id, as a string
export function createIdentity(trustchainId: b64string, trustchainPrivateKey: b64string, userId: string): b64string {
  const token: UserToken = createUserTokenObject(trustchainId, trustchainPrivateKey, userId);
  const identity: Identity = {
    ...token,
    trustchain_id: trustchainId,
  };
  return utils.toB64Json(identity);
}

// email = an email address
// trustchainId = base64 encoded trustchain id
export function createProvisionalIdentity(email: string, trustchainId: b64string): b64string {
  const provisionalIdentity: ProvisionalIdentity = {
    trustchain_id: trustchainId,
    target: 'email',
    value: email,
    ...tankerPreshareKeys(),
  };
  return utils.toB64Json(provisionalIdentity);
}

// tankerIdentity = a Tanker identity created by either createProvisionalIdentity() or createIdentity()
export function getPublicIdentity(tankerIdentity: b64string): b64string {
  const identity: Identity | ProvisionalIdentity = utils.fromB64Json(tankerIdentity);
  let publicIdentity: PublicIdentity;
  if (identity.user_id) {
    publicIdentity = {
      trustchain_id: identity.trustchain_id,
      target: 'user',
      value: identity.user_id,
    };
  } else if (identity.encryption_key_pair && identity.signature_key_pair) {
    publicIdentity = {
      trustchain_id: identity.trustchain_id,
      target: identity.target,
      value: identity.value,
      public_signature_key: identity.signature_key_pair.public_key,
      public_encryption_key: identity.encryption_key_pair.public_key,
    };
  } else {
    throw new Error('Incorrect Tanker identity provided');
  }
  return utils.toB64Json(publicIdentity);
}

// trustchainId = base64 encoded trustchain id
// userToken = a user token created by generateUserToken()
export function upgradeUserToken(trustchainId: b64string, userToken: b64string): b64string {
  const token: UserToken = utils.fromB64Json(userToken);
  return utils.toB64Json({
    ...token,
    trustchain_id: trustchainId,
  });
}
