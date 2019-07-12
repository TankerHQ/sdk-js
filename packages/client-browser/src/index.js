// @flow
import { Tanker as TankerCore, errors, statuses, optionsWithDefaults, getEncryptionFormat, fromString, toString, type TankerOptions, type EncryptionOptions, type b64string, toBase64, fromBase64 } from '@tanker/core';
import { MergerStream, SlicerStream } from '@tanker/stream-browser';
import Dexie from '@tanker/datastore-dexie-browser';

import { assertDataType, getDataLength, castData, type Data } from './dataHelpers';
import { DownloadStream } from './gcs/DownloadStream';
import { UploadStream } from './gcs/UploadStream';
import { makeOutputOptions, type OutputOptions } from './outputOptions';

const { READY } = statuses;

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
    const encryptedData = await this._session.apis.dataProtector.encryptAndShareData(castClearData, options);
    return castData(encryptedData, outputOptions);
  }

  async _streamEncryptData<T: Data>(clearData: Data, options: EncryptionOptions, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const slicer = new SlicerStream({ source: clearData });
    const encryptor = await this._session.apis.dataProtector.makeEncryptorStream(options);
    const merger = new MergerStream(outputOptions);

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async encryptData<T: Data>(clearData: Data, options?: ExtendedEncryptionOptions<T> = {}): Promise<T> {
    this.assert(READY, 'encrypt data');
    assertDataType(clearData, 'clearData');

    const outputOptions = makeOutputOptions(clearData, options);
    const encryptionOptions = this._parseEncryptionOptions(options);

    if (getDataLength(clearData) < STREAM_THRESHOLD)
      return this._simpleEncryptData(clearData, encryptionOptions, outputOptions);

    return this._streamEncryptData(clearData, encryptionOptions, outputOptions);
  }

  async _simpleDecryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const castEncryptedData = await castData(encryptedData, { type: Uint8Array });
    const clearData = await this._session.apis.dataProtector.decryptData(castEncryptedData);
    return castData(clearData, outputOptions);
  }

  async _streamDecryptData<T: Data>(encryptedData: Data, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const slicer = new SlicerStream({ source: encryptedData });
    const decryptor = await this._session.apis.dataProtector.makeDecryptorStream();
    const merger = new MergerStream(outputOptions);

    return new Promise((resolve, reject) => {
      [slicer, decryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }

  async decryptData<T: Data>(encryptedData: Data, options?: OutputOptions<T> = {}): Promise<T> {
    this.assert(READY, 'decrypt data');
    assertDataType(encryptedData, 'encryptedData');

    const outputOptions = makeOutputOptions(encryptedData, options);

    const header = await castData(encryptedData, { type: Uint8Array }, MAX_FORMAT_HEADER_SIZE);
    const { version } = getEncryptionFormat(header);

    if (version < 4)
      return this._simpleDecryptData(encryptedData, outputOptions);

    return this._streamDecryptData(encryptedData, outputOptions);
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
    const source = await castData(encryptedData, { type: Uint8Array }, MAX_SIMPLE_RESOURCE_SIZE);
    return super.getResourceId(source);
  }

  async upload<T: Data>(clearData: Data, options?: ExtendedEncryptionOptions<T> = {}): Promise<string> {
    this.assert(READY, 'upload a file');
    assertDataType(clearData, 'clearData');

    const encryptionOptions = this._parseEncryptionOptions(options);
    const encryptor = await this._session.apis.dataProtector.makeEncryptorStream(encryptionOptions);

    const { clearChunkSize, encryptedChunkSize, overheadPerChunk, resourceId } = encryptor;
    const totalClearSize = getDataLength(clearData);
    const lastClearChunkSize = totalClearSize % clearChunkSize;
    const totalEncryptedSize = Math.floor(totalClearSize / clearChunkSize) * encryptedChunkSize + lastClearChunkSize + overheadPerChunk;

    const { url, headers } = await this._session._client.send('get file upload url', { // eslint-disable-line no-underscore-dangle
      resource_id: resourceId,
      upload_content_length: totalEncryptedSize,
    });

    if (global.File && clearData instanceof global.File) {
      if (!options.mime)
        options.mime = clearData.type;
      if (!options.name)
        options.name = clearData.name;
      if (!options.lastModified)
        options.lastModified = clearData.lastModified;
    }

    const metadata = {};
    if (options.mime)
      metadata.mime = options.mime;
    if (options.name)
      metadata.name = options.name;
    if (options.lastModified)
      metadata.lastModified = options.lastModified;
    const metadataString = toBase64(await this.encrypt(JSON.stringify(metadata), encryptionOptions));
    headers['x-goog-meta-tanker-metadata'] = metadataString;

    const slicer = new SlicerStream({ source: clearData });
    const uploader = new UploadStream(url, headers, totalEncryptedSize, true);

    await new Promise((resolve, reject) => {
      [slicer, encryptor, uploader].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(uploader).on('finish', resolve);
    });

    return resourceId;
  }

  async download<T: Data>(resourceId: string, options?: OutputOptions<T> = {}): Promise<File> {
    this.assert(READY, 'download a file');

    const outputOptions = makeOutputOptions(null, { type: File, ...options });

    const { url } = await this._session._client.send('get file download url', { // eslint-disable-line no-underscore-dangle
      resource_id: resourceId,
    });

    const downloadChunkSize = 1024 * 1024;
    const downloader = new DownloadStream(url, downloadChunkSize, true);
    const encryptedMetadata = await downloader.getMetadata();
    const metadata = JSON.parse(await this.decrypt(fromBase64(encryptedMetadata)));
    const decryptor = await this._session.apis.dataProtector.makeDecryptorStream();
    // FIXME i think it's unsafe to just fetch metadata and use them as options
    // without any validation
    const merger = new MergerStream({ ...metadata, ...outputOptions });

    return new Promise((resolve, reject) => {
      [downloader, decryptor, merger].forEach(s => s.on('error', reject));
      downloader.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }
}

export type { b64string, EmailVerification, PassphraseVerification, KeyVerification, Verification, TankerOptions } from '@tanker/core';
export { errors, fromBase64, toBase64 } from '@tanker/core';
export { Tanker };
export default Tanker;
