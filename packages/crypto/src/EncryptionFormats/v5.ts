import { InvalidArgument, DecryptionFailed } from '@tanker/errors';

import * as aead from '../aead';
import { random } from '../random';
import { assertKey } from '../resourceId';
import * as tcrypto from '../tcrypto';
import * as utils from '../utils';
import { tryDecryptAEAD } from './helpers';
import type { KeyMapper } from './KeyMapper';

type EncryptionData = {
  encryptedData: Uint8Array;
  resourceId: Uint8Array;
  iv: Uint8Array;
};

export class EncryptionV5 {
  static version = 5 as const;

  static features = {
    chunks: false,
    fixedResourceId: true,
  } as const;

  static overhead = 1 + tcrypto.MAC_SIZE + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE;

  static getClearSize = (encryptedSize: number) => encryptedSize - this.overhead;

  static getEncryptedSize = (clearSize: number) => clearSize + this.overhead;

  static serialize = (data: EncryptionData) => utils.concatArrays(new Uint8Array([this.version]), data.resourceId, data.iv, data.encryptedData);

  static unserialize = (buffer: Uint8Array): EncryptionData => {
    const bufferVersion = buffer[0];

    if (bufferVersion !== this.version) {
      throw new InvalidArgument(`expected buffer version to be ${this.version}, was ${bufferVersion}`);
    }

    if (buffer.length < this.overhead) {
      throw new DecryptionFailed({ message: `truncated encrypted data. Length should be at least ${this.overhead} for encryption v5` });
    }

    let pos = 1;
    const resourceId = buffer.subarray(pos, pos + tcrypto.MAC_SIZE);
    pos += tcrypto.MAC_SIZE;

    const iv = buffer.subarray(pos, pos + tcrypto.XCHACHA_IV_SIZE);
    pos += tcrypto.XCHACHA_IV_SIZE;

    const encryptedData = buffer.subarray(pos);

    return { encryptedData, resourceId, iv };
  };

  static encrypt = (key: Uint8Array, plaintext: Uint8Array, resourceId?: Uint8Array): EncryptionData => {
    if (!resourceId) {
      throw new InvalidArgument('Expected a resource ID for encrypt V5');
    }
    const iv = random(tcrypto.XCHACHA_IV_SIZE);

    const encryptedData = aead.encryptAEAD(key, iv, plaintext, resourceId);
    return { encryptedData, iv, resourceId };
  };

  static decrypt = async (keyMapper: KeyMapper, data: EncryptionData): Promise<Uint8Array> => {
    const key = await keyMapper(data.resourceId);
    assertKey(data.resourceId, key);
    return tryDecryptAEAD(data.resourceId, key, data.iv, data.encryptedData, data.resourceId);
  };

  static extractResourceId = (buffer: Uint8Array): Uint8Array => {
    const data = this.unserialize(buffer);
    return data.resourceId;
  };
}
