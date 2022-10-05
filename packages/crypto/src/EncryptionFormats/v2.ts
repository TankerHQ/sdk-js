import { InvalidArgument, DecryptionFailed } from '@tanker/errors';

import * as aead from '../aead';
import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import type { KeyMapper } from './KeyMapper';

type EncryptionData = {
  encryptedData: Uint8Array;
  resourceId: Uint8Array;
  iv: Uint8Array;
};

export class EncryptionV2 {
  static version = 2 as const;

  static features = {
    chunks: false,
    fixedResourceId: false,
  } as const;

  static overhead = 1 + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE;

  static getClearSize = (encryptedSize: number) => encryptedSize - this.overhead;

  static getEncryptedSize = (clearSize: number) => clearSize + this.overhead;

  static serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array([this.version]), data.iv, data.encryptedData);

  static unserialize = (buffer: Uint8Array): EncryptionData => {
    const bufferVersion = buffer[0];

    if (bufferVersion !== this.version) {
      throw new InvalidArgument(`expected buffer version to be ${this.version}, was ${bufferVersion}`);
    }

    if (buffer.length < this.overhead) {
      throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${this.overhead} for encryption v2` });
    }

    const iv = buffer.subarray(1, 1 + tcrypto.XCHACHA_IV_SIZE);
    const encryptedData = buffer.subarray(1 + tcrypto.XCHACHA_IV_SIZE);
    const resourceId = aead.extractMac(encryptedData);
    return { iv, encryptedData, resourceId };
  };

  static encrypt = (key: Uint8Array, plaintext: Uint8Array, additionalData?: Uint8Array): EncryptionData => {
    const iv = random(tcrypto.XCHACHA_IV_SIZE);
    const encryptedData = aead.encryptAEAD(key, iv, plaintext, additionalData);
    const resourceId = aead.extractMac(encryptedData);
    return { iv, encryptedData, resourceId };
  };

  static decrypt = async (keyMapper: KeyMapper, data: EncryptionData, additionalData?: Uint8Array): Promise<Uint8Array> => {
    const key = await keyMapper(data.resourceId);
    try {
      return aead.decryptAEAD(key, data.iv, data.encryptedData, additionalData);
    } catch (error) {
      const b64ResourceId = utils.toBase64(data.resourceId);
      throw new DecryptionFailed({ error: error as Error, b64ResourceId });
    }
  };

  static extractResourceId = (buffer: Uint8Array): Uint8Array => aead.extractMac(buffer);
}
