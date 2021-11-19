export type {
  PublicPermanentIdentity,
  PublicProvisionalIdentity,
  SecretProvisionalIdentity,
  PublicIdentity,
  PublicProvisionalUser,
  ProvisionalUserKeys,
} from './identity';

export {
  _deserializePermanentIdentity,
  _deserializeProvisionalIdentity,
  _deserializePublicIdentity,
  _splitProvisionalAndPermanentPublicIdentities,
  _serializeIdentity,
  assertTrustchainId,
  isProvisionalIdentity,
  identityTargetToVerificationMethodType,
} from './identity';

export { assertUserSecret } from './userSecret';
