// @flow

import { tcrypto } from '@tanker/crypto';

export type Group = {|
  groupId: Uint8Array,
  signatureKeyPair: tcrypto.SodiumKeyPair,
  encryptionKeyPair: tcrypto.SodiumKeyPair,
  lastGroupBlock: Uint8Array,
  index: number,
|};

export type ExternalGroup = {|
  groupId: Uint8Array,
  publicSignatureKey: Uint8Array,
  publicEncryptionKey: Uint8Array,
  // we need to keep this key in case we are added to the group after its
  // creation, to be able to recover the private signature key then
  encryptedPrivateSignatureKey: ?Uint8Array,
  lastGroupBlock: Uint8Array,
  index: number,
|};
