// @flow
import { Tanker as TankerCore, errors, statuses, optionsWithDefaults, getEncryptionFormat, fromString, toString, type TankerOptions, type EncryptionOptions, type b64string } from '@tanker/core';
import { MergerStream, SlicerStream } from '@tanker/stream-node';
import PouchDB from '@tanker/datastore-pouchdb-node';

import { getConstructor, assertDataType, castData, type Data } from './dataHelpers';

const { READY } = statuses;

const STREAM_THRESHOLD = 1024 * 1024; // 1MB

const defaultOptions = {
  dataStore: { adapter: PouchDB },
  sdkType: 'client-node',
};

type OutputOptions<T: Data> = { type?: Class<T> };
type ExtendedEncryptionOptions<T> = EncryptionOptions & OutputOptions<T>;

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }

  async _simpleEncryptData<T: Data>(clearData: Uint8Array, options: EncryptionOptions, outputType: Class<T>): Promise<T> {
    const encryptedData = await this._session.apis.dataProtector.encryptAndShareData(clearData, options);
    return castData(encryptedData, outputType);
  }

  async _streamEncryptData<T: Data>(clearData: Uint8Array, options: EncryptionOptions, outputType: Class<T>): Promise<T> {
    const slicer = new SlicerStream({ source: clearData });
    const encryptor = await this._session.apis.dataProtector.makeEncryptorStream(options);
    const merger = new MergerStream({ type: outputType });

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async encryptData<T: Data>(clearData: Data, options?: ExtendedEncryptionOptions<T> = {}): Promise<T> {
    this.assert(READY, 'encrypt data');
    assertDataType(clearData, 'encryptedData');

    const castClearData = castData(clearData, Uint8Array);
    const outputType = options.type || getConstructor(clearData);
    const encryptionOptions = this._parseEncryptionOptions(options);

    if (castClearData.length < STREAM_THRESHOLD)
      return this._simpleEncryptData(castClearData, encryptionOptions, outputType);

    return this._streamEncryptData(castClearData, encryptionOptions, outputType);
  }

  async _simpleDecryptData<T: Data>(encryptedData: Uint8Array, outputType: Class<T>): Promise<T> {
    const clearData = await this._session.apis.dataProtector.decryptData(encryptedData);
    return castData(clearData, outputType);
  }

  async _streamDecryptData<T: Data>(encryptedData: Uint8Array, outputType: Class<T>): Promise<T> {
    const slicer = new SlicerStream({ source: encryptedData });
    const decryptor = await this._session.apis.dataProtector.makeDecryptorStream();
    const merger = new MergerStream({ type: outputType });

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData<T: Data>(encryptedData: Data, options?: OutputOptions<T> = {}): Promise<T> {
    this.assert(READY, 'decrypt data');
    assertDataType(encryptedData, 'encryptedData');

    const castEncryptedData = castData(encryptedData, Uint8Array);
    const { version } = getEncryptionFormat(castEncryptedData);
    const outputType = options.type || getConstructor(encryptedData);

    if (version < 4)
      return this._simpleDecryptData(castEncryptedData, outputType);

    return this._streamDecryptData(castEncryptedData, outputType);
  }

  async encrypt<T: Data>(plain: string, options?: ExtendedEncryptionOptions<T>): Promise<T> {
    this.assert(READY, 'encrypt');

    if (typeof plain !== 'string')
      throw new errors.InvalidArgument('plain', 'string', plain);

    return this.encryptData(fromString(plain), options);
  }

  async decrypt(cipher: Data): Promise<string> {
    return toString(await this.decryptData(cipher, { type: Uint8Array }));
  }

  async getResourceId(encryptedData: Data): Promise<b64string> {
    const source = castData(encryptedData, Uint8Array);
    return super.getResourceId(source);
  }
}

export type { b64string, EmailVerification, PassphraseVerification, KeyVerification, Verification, TankerOptions } from '@tanker/core';
export { errors, fromBase64, toBase64 } from '@tanker/core';
export { Tanker };
export default Tanker;
