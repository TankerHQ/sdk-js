import type { Key, EncryptionFormatDescription } from '@tanker/crypto';
import { encryptionV3, encryptionV4, encryptionV5, encryptionV6, encryptionV7, random, tcrypto, Padding } from '@tanker/crypto';

export type Resource = {
  resourceId: Uint8Array;
  key: Key;
};

export function makeResource(): Resource {
  const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
  const resourceId = random(tcrypto.MAC_SIZE);
  return { key, resourceId };
}

export const getSimpleEncryption = (paddingStep?: number | Padding) => (paddingStep === Padding.OFF ? encryptionV3 : encryptionV6);

export const getSimpleEncryptionWithFixedResourceId = (paddingStep?: number | Padding) => (paddingStep === Padding.OFF ? encryptionV5 : encryptionV7);

export const getStreamEncryptionFormatDescription = (): EncryptionFormatDescription => ({
  version: 4,
  encryptedChunkSize: encryptionV4.defaultMaxEncryptedChunkSize,
});
