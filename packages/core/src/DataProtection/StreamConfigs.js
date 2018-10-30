// @flow

import { type Key, tcrypto } from '@tanker/crypto';

export const defaultEncryptionSize = 1024 * 1024;
export const defaultOutputSize = defaultEncryptionSize;
export const defaultDecryptionSize = defaultEncryptionSize + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD;

export type ResourceIdKeyMapper = {
  findKey: (Uint8Array) => Promise<Key>
}
