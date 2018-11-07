// @flow

export type DelegationToken = {
  ephemeral_public_signature_key: Uint8Array,
  ephemeral_private_signature_key: Uint8Array,
  user_id: Uint8Array,
  delegation_signature: Uint8Array,
  last_reset: Uint8Array,
}
