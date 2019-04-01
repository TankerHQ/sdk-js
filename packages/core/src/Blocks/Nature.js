// @flow

export const NATURE = Object.freeze({
  trustchain_creation: 1,
  device_creation_v1: 2,
  key_publish_to_device: 3,
  device_revocation_v1: 4,
  device_creation_v2: 6,
  device_creation_v3: 7,
  key_publish_to_user: 8,
  device_revocation_v2: 9,
  user_group_creation_v1: 10,
  key_publish_to_user_group: 11,
  user_group_addition_v1: 12,
});

export type Nature = $Values<typeof NATURE>;

export const NATURE_KIND = Object.freeze({
  trustchain_creation: 0,
  device_creation: 1,
  device_revocation: 2,
  key_publish_to_device: 3,
  key_publish_to_user: 4,
  user_group_creation: 5,
  key_publish_to_user_group: 6,
  user_group_addition: 7,
});

export type NatureKind = $Values<typeof NATURE_KIND>;


export function preferredNature(kind: NatureKind): Nature {
  switch (kind) {
    case NATURE_KIND.trustchain_creation: return NATURE.trustchain_creation;
    case NATURE_KIND.key_publish_to_device: return NATURE.key_publish_to_device;
    case NATURE_KIND.key_publish_to_user: return NATURE.key_publish_to_user;
    case NATURE_KIND.key_publish_to_user_group: return NATURE.key_publish_to_user_group;
    case NATURE_KIND.device_revocation: return NATURE.device_revocation_v2;
    case NATURE_KIND.device_creation: return NATURE.device_creation_v3;
    case NATURE_KIND.user_group_creation: return NATURE.user_group_creation_v1;
    case NATURE_KIND.user_group_addition: return NATURE.user_group_addition_v1;
    default: throw new Error(`invalid kind: ${kind}`);
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
    case NATURE.device_revocation_v1: return NATURE_KIND.device_revocation;
    case NATURE.device_revocation_v2: return NATURE_KIND.device_revocation;
    case NATURE.user_group_creation_v1: return NATURE_KIND.user_group_creation;
    case NATURE.user_group_addition_v1: return NATURE_KIND.user_group_addition;
    default: throw new Error(`invalid nature: ${val}`);
  }
}

export function isTrustchainCreation(nature: Nature): bool {
  return natureKind(nature) === NATURE_KIND.trustchain_creation;
}

export function isDeviceCreation(nature: Nature): bool {
  return natureKind(nature) === NATURE_KIND.device_creation;
}

export function isDeviceRevocation(nature: Nature): bool {
  return natureKind(nature) === NATURE_KIND.device_revocation;
}

export function isKeyPublishToDevice(nature: Nature): bool {
  return natureKind(nature) === NATURE_KIND.key_publish_to_device;
}

export function isKeyPublishToUser(nature: Nature): bool {
  return natureKind(nature) === NATURE_KIND.key_publish_to_user;
}

export function isKeyPublishToUserGroup(nature: Nature): bool {
  return natureKind(nature) === NATURE_KIND.key_publish_to_user_group;
}

export function isKeyPublish(nature: Nature): bool {
  return isKeyPublishToDevice(nature)
  || isKeyPublishToUser(nature)
  || isKeyPublishToUserGroup(nature);
}

export function isUserGroup(nature: Nature): bool {
  return natureKind(nature) === NATURE_KIND.user_group_creation
  || natureKind(nature) === NATURE_KIND.user_group_addition;
}
