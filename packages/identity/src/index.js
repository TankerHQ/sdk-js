// @flow
export { InvalidIdentity } from './InvalidIdentity';

export type {
  PublicPermanentIdentity, SecretPermanentIdentity,
  PublicProvisionalIdentity, SecretProvisionalIdentity,
  PublicIdentity, SecretIdentity,
} from './identity';

export {
  _deserializeIdentity, _deserializePermanentIdentity, _deserializeProvisionalIdentity, _deserializePublicIdentity,
  createIdentity, createProvisionalIdentity, getPublicIdentity, upgradeUserToken,
} from './identity';

export { obfuscateUserId } from './userId';
export { createUserSecretBinary, createUserSecretB64, assertUserSecret, USER_SECRET_SIZE } from './userSecret';
