import type { Key } from '@tanker/crypto';
import { EncryptionV5, EncryptionV7, EncryptionV9, EncryptionV10, random, tcrypto, Padding } from '@tanker/crypto';

export type Resource = {
  resourceId: Uint8Array;
  key: Key;
};

export function makeResource(): Resource {
  const key = random(tcrypto.SYMMETRIC_KEY_SIZE);
  const resourceId = random(tcrypto.RESOURCE_ID_SIZE);
  return { key, resourceId };
}

export const getSimpleEncryption = (paddingStep?: number | Padding) => (paddingStep === Padding.OFF ? EncryptionV9 : EncryptionV10);

export const getSimpleEncryptionWithFixedResourceId = (paddingStep?: number | Padding) => (paddingStep === Padding.OFF ? EncryptionV5 : EncryptionV7);
