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

  async encryptData(clearData: Data, options?: ExtendedEncryptionOptions = {}): Promise<Data> {
    this.assert(this.OPEN, 'encrypt data');

    const inputType = getDataType(clearData, 'clearData');
    const source: Uint8Array = (castData(clearData, 'Uint8Array'): any);

    const outputType = options.type || inputType;

    const encryptionOptions = this._parseEncryptionOptions(options);

    if (source.length < STREAM_THRESHOLD) {
      const encryptedData = await this._session.dataProtector.encryptAndShareData(source, encryptionOptions);
      return castData(encryptedData, outputType);
    }

    const slicer = new SlicerStream({ source });
    const merger = new MergerStream({ type: outputType });
    const encryptor = await this._session.dataProtector.makeEncryptorStream(encryptionOptions);

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData(encryptedData: Data, opts?: OutputOptions = {}): Promise<Data> {
    this.assert(this.OPEN, 'decrypt data');

    const inputType = getDataType(encryptedData);
    const source: Uint8Array = (castData(encryptedData, 'Uint8Array'): any);

    const { version } = getEncryptionFormat(source);

    const outputType = opts.type || inputType;

    if (version < 3) {
      const clearData = await this._session.dataProtector.decryptData(source);
      return castData(clearData, outputType);
    }

    const slicer = new SlicerStream({ source });
    const merger = new MergerStream({ type: outputType });
    const decryptor = await this._session.dataProtector.makeDecryptorStream();

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }

  async encrypt(plain: string, options?: EncryptionOptions): Promise<Uint8Array> {
    this.assert(this.OPEN, 'encrypt');

    if (typeof plain !== 'string')
      throw new errors.InvalidArgument('plain', 'string', plain);

    // $FlowFixMe
    return this.encryptData(fromString(plain), { ...options, type: 'Uint8Array' });
  }

  async decrypt(cipher: Data): Promise<string> {
    // $FlowFixMe
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
