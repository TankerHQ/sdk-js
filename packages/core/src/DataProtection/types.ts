import type { Key, EncryptionFormatDescription } from '@tanker/crypto';
import { encryptionV3, encryptionV4, encryptionV5, random, tcrypto } from '@tanker/crypto';

export type Resource = {
  resourceId: Uint8Array;
  key: Key;
};

export function makeResource(): Resource {
  const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
  const resourceId = random(tcrypto.MAC_SIZE);
  return { key, resourceId };
}

export const getSimpleEncryption = () => encryptionV3;

export const getSimpleEncryptionWithFixedResourceId = () => encryptionV5;

export const getStreamEncryptionFormatDescription = (): EncryptionFormatDescription => ({
  version: 4,
  encryptedChunkSize: encryptionV4.defaultMaxEncryptedChunkSize,
});
