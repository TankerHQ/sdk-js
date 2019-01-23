// @flow
import { Tanker as TankerCore, optionsWithDefaults, getEncryptionFormat, errors, type TankerOptions, type EncryptionOptions } from '@tanker/core';
import { MergerStream, SlicerStream } from '@tanker/stream-node';
import PouchDB from '@tanker/datastore-pouchdb-node';

const STREAM_THRESHOLD = 1024 * 1024; // 1MB

const defaultOptions = {
  dataStore: { adapter: PouchDB },
  sdkType: 'client-node'
};

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }

  async encryptData(plain: Uint8Array, options?: EncryptionOptions): Promise<Uint8Array> {
    this.assert(this.OPEN, 'encrypt data');

    if (!(plain instanceof Uint8Array))
      throw new errors.InvalidArgument('plain', 'Uint8Array', plain);

    const opts = this._parseEncryptionOptions(options);

    if (plain.length < STREAM_THRESHOLD)
      return this._session.dataProtector.encryptAndShareData(plain, opts);

    const slicer = new SlicerStream({ source: plain });
    const merger = new MergerStream({ type: 'Uint8Array' });
    const encryptor = await this._session.dataProtector.makeEncryptorStream(opts);

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData(encryptedData: Uint8Array): Promise<Uint8Array> {
    this.assert(this.OPEN, 'decrypt data');

    if (!(encryptedData instanceof Uint8Array))
      throw new errors.InvalidArgument('encryptedData', 'Uint8Array', encryptedData);

    const { version } = getEncryptionFormat(encryptedData);

    if (version < 4)
      return this._session.dataProtector.decryptData(encryptedData);

    const slicer = new SlicerStream({ source: encryptedData });
    const merger = new MergerStream({ type: 'Uint8Array' });
    const decryptor = await this._session.dataProtector.makeDecryptorStream();

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }
}

export type { b64string } from '@tanker/core';
export { errors, getTankerVersion, TankerStatus, createUserSecret, fromBase64, fromString, getResourceId, toBase64, toString } from '@tanker/core';
export { Tanker };
export default Tanker;
