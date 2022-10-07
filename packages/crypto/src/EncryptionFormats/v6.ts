import { InvalidArgument, DecryptionFailed } from '@tanker/errors';
import { Padding, paddedFromClearSize, padClearData, removePadding } from '../padding';

import * as aead from '../aead';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import type { KeyMapper } from './KeyMapper';
import { tryDecryptAEAD } from './helpers';

type EncryptionData = {
  encryptedData: Uint8Array,
  resourceId: Uint8Array,
  iv: Uint8Array,
};

export class EncryptionV6 {
  static version = 6 as const;

  static features = {
    chunks: false,
    fixedResourceId: false,
  } as const;

  static overhead = 1 + tcrypto.MAC_SIZE + 1;

  // -1 is the padding byte (0x80)
  static getClearSize = (encryptedSize: number) => encryptedSize - this.overhead;

  static getEncryptedSize = (clearSize: number, paddingStep?: number | Padding) => paddedFromClearSize(clearSize, paddingStep) + this.overhead - 1;

  static serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array([this.version]), data.encryptedData);

  static unserialize = (buffer: Uint8Array): EncryptionData => {
    const bufferVersion = buffer[0];
    if (bufferVersion !== this.version) {
      throw new InvalidArgument(`expected buffer version to be ${this.version}, was ${bufferVersion}`);
    }

    if (buffer.length < this.overhead) {
      throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${this.overhead} for encryption v6` });
    }

    const encryptedData = buffer.subarray(1);
    const resourceId = aead.extractMac(encryptedData);
    const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros

    return { encryptedData, resourceId, iv };
  };

  static encrypt = (key: Uint8Array, plaintext: Uint8Array, paddingStep?: number | Padding): EncryptionData => {
    const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
    const paddedData = padClearData(plaintext, paddingStep);
    const associatedData = new Uint8Array([this.version]);
    const encryptedData = aead.encryptAEAD(key, iv, paddedData, associatedData);
    const resourceId = aead.extractMac(encryptedData);
    return { encryptedData, iv, resourceId };
  };

  static decrypt = async (keyMapper: KeyMapper, data: EncryptionData): Promise<Uint8Array> => {
    const key = await keyMapper(data.resourceId);

    const associatedData = new Uint8Array([this.version]);
    return removePadding(tryDecryptAEAD(data.resourceId, key, data.iv, data.encryptedData, associatedData));
  };

  static extractResourceId = (buffer: Uint8Array): Uint8Array => aead.extractMac(buffer);
}
