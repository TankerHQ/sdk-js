// @flow

import { tcrypto } from '@tanker/crypto';

type GroupBase = {|
  groupId: Uint8Array,
  publicSignatureKey: Uint8Array,
  publicEncryptionKey: Uint8Array,
  lastGroupBlock: Uint8Array,
  groupVersion: number
|};

export type ExternalGroup = {|
  ...GroupBase,
  encryptedPrivateSignatureKey: Uint8Array,
|};

export type InternalGroup = {|
  ...GroupBase,
  signatureKeyPair: tcrypto.SodiumKeyPair,
  encryptionKeyPair: tcrypto.SodiumKeyPair,
|};

export type Group = InternalGroup | ExternalGroup;

export function isInternalGroup(group: Group): %checks {
  return !!group.encryptionKeyPair;
}
