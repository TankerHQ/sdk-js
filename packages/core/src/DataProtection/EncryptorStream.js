// @flow

import varint from 'varint';

import { tcrypto, aead } from '@tanker/crypto';
import { Transform } from '@tanker/stream-base';

import { currentStreamVersion, type ResourceIdKeyPair } from '../Resource/ResourceManager';
import { concatArrays } from '../Blocks/Serialize';
import { defaultEncryptionSize } from './StreamConfigs';

export default class EncryptorStream extends Transform {
  _encryptionSize: number;

  _state: {
    resourceIdKeyPair: ResourceIdKeyPair,
    index: number
  }

  constructor(resourceId: Uint8Array, key: Uint8Array, encryptionSize: number = defaultEncryptionSize) {
    super({
      writableHighWaterMark: encryptionSize,
      readableHighWaterMark: encryptionSize + tcrypto.SYMMETRIC_ENCRYPTION_OVERHEAD,
    });

    this._encryptionSize = encryptionSize;
    this._state = {
      resourceIdKeyPair: {
        key,
        resourceId
      },
      index: 0
    };

    this._writeHeader();
  }

  _deriveKey() {
    const subKey = tcrypto.deriveKey(this._state.resourceIdKeyPair.key, this._state.index);
    this._state.index += 1;
    return subKey;
  }

  _writeHeader() {
    const header = concatArrays(varint.encode(currentStreamVersion), this._state.resourceIdKeyPair.resourceId);
    this.push(header);
  }

  async _transform(clearData: Uint8Array, encoding: ?string, done: Function) {
    const subKey = this._deriveKey();

    try {
      const eData = await aead.encryptAEADv2(subKey, clearData);
      this.push(eData);
    } catch (err) {
      return done(err);
    }

    done();
  }
}
