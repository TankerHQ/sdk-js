import { InvalidArgument, DecryptionFailed } from '@tanker/errors';
import { Padding, paddedFromClearSize, padClearData, removePadding } from '../padding';

import * as aead from '../aead';
import { random } from '../random';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import type { KeyMapper } from './KeyMapper';
import { tryDecryptAEAD } from './helpers';
import { assertKey } from '../resourceId';

type EncryptionData = {
  encryptedData: Uint8Array;
  resourceId: Uint8Array;
  iv: Uint8Array;
};

export class EncryptionV7 {
  static version = 7 as const;

  static features = {
    chunks: false,
    fixedResourceId: true,
  } as const;

  static overhead = 1 + tcrypto.RESOURCE_ID_SIZE + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE + 1;

  // -1 is the padding byte (0x80)
  static getClearSize = (encryptedSize: number) => encryptedSize - this.overhead;

  static getEncryptedSize = (clearSize: number, paddingStep?: number | Padding) => paddedFromClearSize(clearSize, paddingStep) + this.overhead - 1;

  static serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array([this.version]), data.resourceId, data.iv, data.encryptedData);

  static unserialize = (buffer: Uint8Array): EncryptionData => {
    const bufferVersion = buffer[0];

    if (bufferVersion !== this.version) {
      throw new InvalidArgument(`expected buffer version to be ${this.version}, was ${bufferVersion}`);
    }

    if (buffer.length < this.overhead) {
      throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${this.overhead} for encryption v7` });
    }

    let pos = 1;
    const resourceId = buffer.subarray(pos, pos + tcrypto.RESOURCE_ID_SIZE);
    pos += tcrypto.RESOURCE_ID_SIZE;

    const iv = buffer.subarray(pos, pos + tcrypto.XCHACHA_IV_SIZE);
    pos += tcrypto.XCHACHA_IV_SIZE;

    const encryptedData = buffer.subarray(pos);

    return { encryptedData, resourceId, iv };
  };

  static encrypt = (key: Uint8Array, plaintext: Uint8Array, resourceId?: Uint8Array, paddingStep?: number | Padding): EncryptionData => {
    if (!resourceId) {
      throw new InvalidArgument('Expected a resource ID for encrypt V7');
    }
    const iv = random(tcrypto.XCHACHA_IV_SIZE);
    const paddedData = padClearData(plaintext, paddingStep);
    const associatedData = utils.concatArrays(new Uint8Array([this.version]), resourceId);
    const encryptedData = aead.encryptAEAD(key, iv, paddedData, associatedData);
    return { encryptedData, iv, resourceId };
  };

  static decrypt = async (keyMapper: KeyMapper, data: EncryptionData): Promise<Uint8Array> => {
    const key = await keyMapper(data.resourceId);
    assertKey(data.resourceId, key);

    const associatedData = utils.concatArrays(new Uint8Array([this.version]), data.resourceId);
    return removePadding(tryDecryptAEAD(data.resourceId, key, data.iv, data.encryptedData, associatedData));
  };

  static extractResourceId = (buffer: Uint8Array): Uint8Array => {
    const data = this.unserialize(buffer);
    return data.resourceId;
  };
}
