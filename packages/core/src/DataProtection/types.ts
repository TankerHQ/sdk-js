import type { Key, EncryptionFormatDescription } from '@tanker/crypto';
import { EncryptionV3, EncryptionV4, EncryptionV5, EncryptionV6, EncryptionV7, EncryptionV8, random, tcrypto, Padding } from '@tanker/crypto';

export type Resource = {
  resourceId: Uint8Array;
  key: Key;
};

export function makeResource(): Resource {
  const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
  const resourceId = random(tcrypto.MAC_SIZE);
  return { key, resourceId };
}

export const getSimpleEncryption = (paddingStep?: number | Padding) => (paddingStep === Padding.OFF ? EncryptionV3 : EncryptionV6);

export const getSimpleEncryptionWithFixedResourceId = (paddingStep?: number | Padding) => (paddingStep === Padding.OFF ? EncryptionV5 : EncryptionV7);

export const getStreamEncryptionFormatDescription = (paddingStep?: number | Padding): EncryptionFormatDescription => {
  if (paddingStep === Padding.OFF)
    return ({
      version: 4,
      encryptedChunkSize: EncryptionV4.defaultMaxEncryptedChunkSize,
    });
  return ({
    version: 8,
    encryptedChunkSize: EncryptionV8.defaultMaxEncryptedChunkSize,
  });
};
