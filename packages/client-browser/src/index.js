// @flow
import { Tanker as TankerCore, errors, optionsWithDefaults, getEncryptionFormat, fromString, toString, type TankerOptions, type EncryptionOptions, type b64string } from '@tanker/core';
import { MergerStream, SlicerStream } from '@tanker/stream-browser';
import Dexie from '@tanker/datastore-dexie-browser';

import { assertDataType, getDataLength, castData, type Data } from './dataHelpers';
import { makeOutputOptions, type OutputOptions } from './outputOptions';

const STREAM_THRESHOLD = 1024 * 1024; // 1MB
const MAX_FORMAT_HEADER_SIZE = 1 + 24;
const MAX_SIMPLE_RESOURCE_SIZE = 1 + 40 + 5 * (1024 * 1024);

const defaultOptions = {
  dataStore: { adapter: Dexie },
  sdkType: 'client-browser'
};

type ExtendedEncryptionOptions<T> = EncryptionOptions & OutputOptions<T>;

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }

  async _simpleEncryptData<T: Data>(clearData: Data, options: EncryptionOptions, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const castClearData = await castData(clearData, { type: Uint8Array });
    const encryptedData = await this._session.dataProtector.encryptAndShareData(castClearData, options);
    return castData(encryptedData, outputOptions);
  }

  async _streamEncryptData<T: Data>(clearData: Data, options: EncryptionOptions, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const slicer = new SlicerStream({ source: clearData });
    const encryptor = await this._session.dataProtector.makeEncryptorStream(options);
    // $FlowFixMe Yes types are compatible
    const merger = new MergerStream(outputOptions);

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async encryptData<T: Data>(clearData: Data, options?: ExtendedEncryptionOptions<T> = {}): Promise<T> {
    this.assert(this.OPEN, 'encrypt data');
    assertDataType(clearData, 'clearData');

    const outputOptions = makeOutputOptions(clearData, options);
    const encryptionOptions = this._parseEncryptionOptions(options);

    if (getDataLength(clearData) < STREAM_THRESHOLD)
      return this._simpleEncryptData(clearData, encryptionOptions, outputOptions);

    return this._streamEncryptData(clearData, encryptionOptions, outputOptions);
  }

  async _simpleDecryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const castEncryptedData = await castData(encryptedData, { type: Uint8Array });
    const clearData = await this._session.dataProtector.decryptData(castEncryptedData);
    return castData(clearData, outputOptions);
  }

  async _streamDecryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const slicer = new SlicerStream({ source: encryptedData });
    const decryptor = await this._session.dataProtector.makeDecryptorStream();
    const merger = new MergerStream(outputOptions);

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData<T: Data>(encryptedData: Data, options?: OutputOptions<T> = {}): Promise<T> {
    this.assert(this.OPEN, 'decrypt data');
    assertDataType(encryptedData, 'encryptedData');

    const outputOptions = makeOutputOptions(encryptedData, options);

    const header = await castData(encryptedData, { type: Uint8Array }, MAX_FORMAT_HEADER_SIZE);
    const { version } = getEncryptionFormat(header);

    if (version < 4)
      return this._simpleDecryptData(encryptedData, outputOptions);

    return this._streamDecryptData(encryptedData, outputOptions);
  }

  async encrypt<T: Data>(plain: string, options?: ExtendedEncryptionOptions<T>): Promise<T> {
    this.assert(this.OPEN, 'encrypt');

    if (typeof plain !== 'string')
      throw new errors.InvalidArgument('plain', 'string', plain);

    return this.encryptData(fromString(plain), options);
  }

  async decrypt(cipher: Data): Promise<string> {
    return toString(await this.decryptData(cipher, { type: Uint8Array }));
  }

  async getResourceId(encryptedData: Data): Promise<b64string> {
    const source = await castData(encryptedData, { type: Uint8Array }, MAX_SIMPLE_RESOURCE_SIZE);
    return super.getResourceId(source);
  }
}

export type { b64string } from '@tanker/core';
export { errors, getTankerVersion, TankerStatus, createUserSecret, fromBase64, fromString, toBase64, toString } from '@tanker/core';
export { Tanker };
export default Tanker;
