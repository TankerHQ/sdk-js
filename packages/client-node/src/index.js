// @flow
import { Tanker as TankerCore, errors, optionsWithDefaults, getEncryptionFormat, fromString, toString, type TankerOptions, type EncryptionOptions, type b64string } from '@tanker/core';
import { MergerStream, SlicerStream } from '@tanker/stream-node';
import PouchDB from '@tanker/datastore-pouchdb-node';

import { getDataType, castData, type Data, type DataType } from './dataHelpers';

const STREAM_THRESHOLD = 1024 * 1024; // 1MB

const defaultOptions = {
  dataStore: { adapter: PouchDB },
  sdkType: 'client-node',
};

type OutputOptions = { type?: DataType };
type ExtendedEncryptionOptions = EncryptionOptions & OutputOptions;

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }

  async _simpleEncryptData(clearData: Uint8Array, options: EncryptionOptions, outputType: DataType): Promise<Data> {
    const encryptedData = await this._session.dataProtector.encryptAndShareData(clearData, options);
    return castData(encryptedData, outputType);
  }

  async _streamEncryptData(clearData: Uint8Array, options: EncryptionOptions, outputType: DataType): Promise<Data> {
    const slicer = new SlicerStream({ source: clearData });
    const encryptor = await this._session.dataProtector.makeEncryptorStream(options);
    const merger = new MergerStream({ type: outputType });

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async encryptData(clearData: Data, options?: ExtendedEncryptionOptions = {}): Promise<Data> {
    this.assert(this.OPEN, 'encrypt data');

    const inputType = getDataType(clearData, 'clearData');
    const castClearData: Uint8Array = (castData(clearData, 'Uint8Array'): any);
    const outputType = options.type || inputType;
    const encryptionOptions = this._parseEncryptionOptions(options);

    if (castClearData.length < STREAM_THRESHOLD)
      return this._simpleEncryptData(castClearData, encryptionOptions, outputType);

    return this._streamEncryptData(castClearData, encryptionOptions, outputType);
  }

  async _simpleDecryptData(encryptedData: Uint8Array, outputType: DataType): Promise<Data> {
    const clearData = await this._session.dataProtector.decryptData(encryptedData);
    return castData(clearData, outputType);
  }

  async _streamDecryptData(encryptedData: Uint8Array, outputType: DataType): Promise<Data> {
    const slicer = new SlicerStream({ source: encryptedData });
    const decryptor = await this._session.dataProtector.makeDecryptorStream();
    const merger = new MergerStream({ type: outputType });

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData(encryptedData: Data, options?: OutputOptions = {}): Promise<Data> {
    this.assert(this.OPEN, 'decrypt data');

    const inputType = getDataType(encryptedData);
    const castEncryptedData: Uint8Array = (castData(encryptedData, 'Uint8Array'): any);

    const { version } = getEncryptionFormat(castEncryptedData);

    const outputType = options.type || inputType;

    if (version < 4)
      return this._simpleDecryptData(castEncryptedData, outputType);

    return this._streamDecryptData(castEncryptedData, outputType);
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
    const source: Uint8Array = (castData(encryptedData, 'Uint8Array'): any);
    return super.getResourceId(source);
  }
}

export type { b64string } from '@tanker/core';
export { errors, getTankerVersion, TankerStatus, createUserSecret, fromBase64, fromString, getResourceId, toBase64, toString } from '@tanker/core';
export { Tanker };
export default Tanker;
