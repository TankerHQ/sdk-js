// @flow
import { Tanker as TankerCore, errors, optionsWithDefaults, getEncryptionFormat, fromString, toString, type TankerOptions, type EncryptionOptions, type b64string } from '@tanker/core';
import { MergerStream, SlicerStream } from '@tanker/stream-browser';
import Dexie from '@tanker/datastore-dexie-browser';

import { assertDataType, getDataLength, castData, type Data, type DataType } from './dataHelpers';
import { makeOutputOptions, type OutputOptions } from './outputOptions';

const STREAM_THRESHOLD = 1024 * 1024; // 1MB
const MAX_FORMAT_HEADER_SIZE = 1 + 24;
const MAX_SIMPLE_RESOURCE_SIZE = 1 + 40 + 5 * (1024 * 1024);

const defaultOptions = {
  dataStore: { adapter: Dexie },
  sdkType: 'client-browser'
};

type ExtendedEncryptionOptions = EncryptionOptions & OutputOptions;

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }

  async _simpleEncryptData(clearData: Data, options: EncryptionOptions, outputOptions: OutputOptions & { type: DataType }): Promise<Data> {
    const castClearData: Uint8Array = (await castData(clearData, { type: 'Uint8Array' }): any);
    const encryptedData = await this._session.dataProtector.encryptAndShareData(castClearData, options);
    return castData(encryptedData, outputOptions);
  }

  async _streamEncryptData(clearData: Data, options: EncryptionOptions, outputOptions: OutputOptions & { type: DataType }): Promise<Data> {
    const slicer = new SlicerStream({ source: clearData });
    const encryptor = await this._session.dataProtector.makeEncryptorStream(options);
    // $FlowFixMe Yes types are compatible
    const merger = new MergerStream(outputOptions);

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async encryptData(clearData: Data, options?: ExtendedEncryptionOptions = {}): Promise<Data> {
    this.assert(this.OPEN, 'encrypt data');
    assertDataType(clearData, 'clearData');

    const outputOptions = makeOutputOptions(clearData, options);
    const encryptionOptions = this._parseEncryptionOptions(options);

    if (getDataLength(clearData) < STREAM_THRESHOLD)
      return this._simpleEncryptData(clearData, encryptionOptions, outputOptions);

    return this._streamEncryptData(clearData, encryptionOptions, outputOptions);
  }

  async _simpleDecryptData(encryptedData: Data, outputOptions: OutputOptions & { type: DataType }): Promise<Data> {
    const castEncryptedData: Uint8Array = (await castData(encryptedData, { type: 'Uint8Array' }): any);
    const clearData = await this._session.dataProtector.decryptData(castEncryptedData);
    return castData(clearData, outputOptions);
  }

  async _streamDecryptData(encryptedData: Data, outputOptions: OutputOptions & { type: DataType }): Promise<Data> {
    const slicer = new SlicerStream({ source: encryptedData });
    const decryptor = await this._session.dataProtector.makeDecryptorStream();
    // $FlowFixMe Yes types are compatible
    const merger = new MergerStream(outputOptions);

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData(encryptedData: Data, options?: OutputOptions = {}): Promise<Data> {
    this.assert(this.OPEN, 'decrypt data');
    assertDataType(encryptedData, 'encryptedData');

    const outputOptions = makeOutputOptions(encryptedData, options);

    const header: Uint8Array = (await castData(encryptedData, { type: 'Uint8Array' }, MAX_FORMAT_HEADER_SIZE): any);
    const { version } = getEncryptionFormat(header);

    if (version < 4)
      return this._simpleDecryptData(encryptedData, outputOptions);

    return this._streamDecryptData(encryptedData, outputOptions);
  }

  async encrypt(plain: string, options?: EncryptionOptions): Promise<Uint8Array> {
    this.assert(this.OPEN, 'encrypt');

    if (typeof plain !== 'string')
      throw new errors.InvalidArgument('plain', 'string', plain);

    // $FlowFixMe we ARE asking for a Uint8Array back
    return this.encryptData(fromString(plain), { ...options, type: 'Uint8Array' });
  }

  async decrypt(cipher: Data): Promise<string> {
    // $FlowFixMe we ARE asking for a Uint8Array back
    return toString(await this.decryptData(cipher, { type: 'Uint8Array' }));
  }

  async getResourceId(encryptedData: Data): Promise<b64string> {
    const source: Uint8Array = (await castData(encryptedData, { type: 'Uint8Array' }, MAX_SIMPLE_RESOURCE_SIZE): any);
    return super.getResourceId(source);
  }
}

export type { b64string } from '@tanker/core';
export { errors, getTankerVersion, TankerStatus, createUserSecret, fromBase64, fromString, getResourceId, toBase64, toString } from '@tanker/core';
export { Tanker };
export default Tanker;
