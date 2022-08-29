import { InternalError } from '@tanker/errors';

export const NATURE = Object.freeze({
  trustchain_creation: 1,
  device_creation_v1: 2,
  key_publish_to_device: 3,
  // device_revocation_v1: 4,
  // user_reset: 5,
  device_creation_v2: 6,
  device_creation_v3: 7,
  key_publish_to_user: 8,
  // device_revocation_v2: 9,
  user_group_creation_v1: 10,
  key_publish_to_user_group: 11,
  user_group_addition_v1: 12,
  key_publish_to_provisional_user: 13,
  provisional_identity_claim: 14,
  user_group_creation_v2: 15,
  user_group_addition_v2: 16,
  user_group_creation_v3: 17,
  user_group_addition_v3: 18,
  session_certificate: 19,
  // user_group_update: 20,
  user_group_removal: 21,
});

const NATURE_INT = Object.values(NATURE);

export type Nature = typeof NATURE[keyof typeof NATURE];

export function natureExists(nature: number) {
  return NATURE_INT.includes(nature as Nature);
}

export const NATURE_KIND = Object.freeze({
  trustchain_creation: 0,
  device_creation: 1,
  // device_revocation: 2,
  key_publish_to_device: 3,
  key_publish_to_user: 4,
  user_group_creation: 5,
  key_publish_to_user_group: 6,
  user_group_addition: 7,
  key_publish_to_provisional_user: 8,
  provisional_identity_claim: 9,
  session_certificate: 10,
  user_group_removal: 11,
});

export type NatureKind = typeof NATURE_KIND[keyof typeof NATURE_KIND];

export function preferredNature(kind: NatureKind): Nature {
  switch (kind) {
    case NATURE_KIND.trustchain_creation: return NATURE.trustchain_creation;
    case NATURE_KIND.key_publish_to_device: return NATURE.key_publish_to_device;
    case NATURE_KIND.key_publish_to_user: return NATURE.key_publish_to_user;
    case NATURE_KIND.key_publish_to_user_group: return NATURE.key_publish_to_user_group;
    case NATURE_KIND.key_publish_to_provisional_user: return NATURE.key_publish_to_provisional_user;
    case NATURE_KIND.device_creation: return NATURE.device_creation_v3;
    case NATURE_KIND.user_group_creation: return NATURE.user_group_creation_v3;
    case NATURE_KIND.user_group_addition: return NATURE.user_group_addition_v3;
    case NATURE_KIND.provisional_identity_claim: return NATURE.provisional_identity_claim;
    case NATURE_KIND.session_certificate: return NATURE.session_certificate;
    case NATURE_KIND.user_group_removal: return NATURE.user_group_removal;
    default: throw new InternalError(`invalid kind: ${kind}`);
  }
}

export function natureKind(val: Nature): NatureKind {
  switch (val) {
    case NATURE.trustchain_creation: return NATURE_KIND.trustchain_creation;
    case NATURE.device_creation_v1: return NATURE_KIND.device_creation;
    case NATURE.device_creation_v2: return NATURE_KIND.device_creation;
    case NATURE.device_creation_v3: return NATURE_KIND.device_creation;
    case NATURE.key_publish_to_device: return NATURE_KIND.key_publish_to_device;
    case NATURE.key_publish_to_user: return NATURE_KIND.key_publish_to_user;
    case NATURE.key_publish_to_user_group: return NATURE_KIND.key_publish_to_user_group;
    case NATURE.key_publish_to_provisional_user: return NATURE_KIND.key_publish_to_provisional_user;
    case NATURE.user_group_creation_v1: return NATURE_KIND.user_group_creation;
    case NATURE.user_group_creation_v2: return NATURE_KIND.user_group_creation;
    case NATURE.user_group_creation_v3: return NATURE_KIND.user_group_creation;
    case NATURE.user_group_addition_v1: return NATURE_KIND.user_group_addition;
    case NATURE.user_group_addition_v2: return NATURE_KIND.user_group_addition;
    case NATURE.user_group_addition_v3: return NATURE_KIND.user_group_addition;
    case NATURE.provisional_identity_claim: return NATURE_KIND.provisional_identity_claim;
    case NATURE.session_certificate: return NATURE_KIND.session_certificate;
    case NATURE.user_group_removal: return NATURE_KIND.user_group_removal;
    default: throw new InternalError(`invalid nature: ${val}`);
  }
}
