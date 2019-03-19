// @flow

import { tcrypto } from '@tanker/crypto';

export type Group = {|
  groupId: Uint8Array,
  signatureKeyPair: tcrypto.SodiumKeyPair,
  encryptionKeyPair: tcrypto.SodiumKeyPair,
  lastGroupBlock: Uint8Array,
  index: number,
|};

export type PendingEncryptionKeys = {|
  appPublicSignatureKey: Uint8Array,
  tankerPublicSignatureKey: Uint8Array,
  encryptedGroupPrivateEncryptionKey: Uint8Array,
|};

export type ExternalGroup = {|
  groupId: Uint8Array,
  publicSignatureKey: Uint8Array,
  publicEncryptionKey: Uint8Array,
  // we need to keep this key in case we are added to the group after its
  // creation, to be able to recover the private signature key then
  encryptedPrivateSignatureKey: ?Uint8Array,
  // we need to keep these keys in case we claim the provisional identity after
  // the group has been verified
  pendingEncryptionKeys: Array<PendingEncryptionKeys>,
  lastGroupBlock: Uint8Array,
  index: number,
|};
