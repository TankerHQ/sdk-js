import { InvalidArgument, DecryptionFailed } from '@tanker/errors';

import * as aead from '../aead';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';

type EncryptionData = {
  encryptedData: Uint8Array;
  resourceId: Uint8Array;
  iv: Uint8Array;
};

export class EncryptionV3 {
  static version = 3 as const;

  static features = {
    chunks: false,
    fixedResourceId: false,
  } as const;

  static overhead = 1 + tcrypto.MAC_SIZE;

  static getClearSize = (encryptedSize: number) => encryptedSize - this.overhead;

  static getEncryptedSize = (clearSize: number) => clearSize + this.overhead;

  static serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array([this.version]), data.encryptedData);

  static unserialize = (buffer: Uint8Array): EncryptionData => {
    const bufferVersion = buffer[0];

    if (bufferVersion !== this.version) {
      throw new InvalidArgument(`expected buffer version to be ${this.version}, was ${bufferVersion}`);
    }

    if (buffer.length < this.overhead) {
      throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${this.overhead} for encryption v3` });
    }

    const encryptedData = buffer.subarray(1);
    const resourceId = aead.extractMac(encryptedData);
    const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros

    return { encryptedData, resourceId, iv };
  };

  static encrypt = (key: Uint8Array, plaintext: Uint8Array): EncryptionData => {
    const iv = new Uint8Array(tcrypto.XCHACHA_IV_SIZE); // zeros
    const encryptedData = aead.encryptAEAD(key, iv, plaintext);
    const resourceId = aead.extractMac(encryptedData);
    return { encryptedData, iv, resourceId };
  };

  static decrypt = (key: Uint8Array, data: EncryptionData): Uint8Array => aead.decryptAEAD(key, data.iv, data.encryptedData);

  static extractResourceId = (buffer: Uint8Array): Uint8Array => aead.extractMac(buffer);
}
