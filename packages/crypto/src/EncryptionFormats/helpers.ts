import { DecryptionFailed } from '@tanker/errors';
import * as aead from '../aead';
import * as utils from '../utils';
import type { Key } from '../aliases';

export const tryDecryptAEAD = (resourceId: Uint8Array, key: Key, iv: Uint8Array, encryptedData: Uint8Array, associatedData?: Uint8Array): Uint8Array => {
  try {
    return aead.decryptAEAD(key, iv, encryptedData, associatedData);
  } catch (error) {
    const b64ResourceId = utils.toBase64(resourceId);
    throw new DecryptionFailed({ error: error as Error, b64ResourceId });
  }
};
