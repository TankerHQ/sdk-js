// @flow
import type { TankerOptions, ShareWithOptions, b64string } from '@tanker/core';
import { Tanker as TankerCore, errors, statuses, optionsWithDefaults, getEncryptionFormat, fromString, toString, fromBase64, toBase64, assertShareWithOptions } from '@tanker/core';
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

type EncryptionOptions<T> = ShareWithOptions & OutputOptions<T>;

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }

  async _simpleEncryptData<T: Data>(clearData: Data, options: ShareWithOptions, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const castClearData = await castData(clearData, { type: Uint8Array });
    const encryptedData = await this._session.apis.dataProtector.encryptAndShareData(castClearData, options);
    return castData(encryptedData, outputOptions);
  }

  async _streamEncryptData<T: Data>(clearData: Data, options: ShareWithOptions, outputOptions: OutputOptions<T> & { type: Class<T> }): Promise<T> {
    const slicer = new SlicerStream({ source: clearData });
    const encryptor = await this._session.apis.dataProtector.makeEncryptorStream(options);
    const merger = new MergerStream(outputOptions);

    return new Promise((resolve, reject) => {
      [slicer, encryptor, merger].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(merger).on('data', resolve);
    });
  }

  async encryptData<T: Data>(clearData: Data, options?: EncryptionOptions<T> = {}): Promise<T> {
    this.assert(READY, 'encrypt data');
    assertDataType(clearData, 'clearData');
    assertShareWithOptions(options, 'options');

    const outputOptions = makeOutputOptions(clearData, options);

    if (getDataLength(clearData) < STREAM_THRESHOLD)
      return this._simpleEncryptData(clearData, options, outputOptions);

    return this._streamEncryptData(clearData, options, outputOptions);
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

  async encrypt<T: Data>(plain: string, options?: EncryptionOptions<T>): Promise<T> {
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

  async upload(clearData: Data, options?: ShareWithOptions = {}): Promise<string> {
    this.assert(READY, 'upload a file');
    assertDataType(clearData, 'clearData');
    assertShareWithOptions(options, 'options');

    const encryptor = await this._session.apis.dataProtector.makeEncryptorStream(options);

    const { clearChunkSize, encryptedChunkSize, overheadPerChunk, resourceId } = encryptor;
    const totalClearSize = getDataLength(clearData);
    const lastClearChunkSize = totalClearSize % clearChunkSize;
    const totalEncryptedSize = Math.floor(totalClearSize / clearChunkSize) * encryptedChunkSize + lastClearChunkSize + overheadPerChunk;

    const { url, headers, service } = await this._session._client.send('get file upload url', { // eslint-disable-line no-underscore-dangle
      resource_id: resourceId,
      upload_content_length: totalEncryptedSize,
    });

    if (service !== 'GCS')
      throw new errors.InternalError(`unsupported storage service: ${service}`);

    let metadata = {};

    if (global.File && clearData instanceof global.File) {
      metadata = {
        mime: clearData.type,
        name: clearData.name,
        lastModified: clearData.lastModified,
      };
    }

    const encryptedMetadata = toBase64(await this.encrypt(JSON.stringify(metadata), { ...options, type: Uint8Array }));

    const slicer = new SlicerStream({ source: clearData });
    const uploader = new UploadStream(url, headers, totalEncryptedSize, encryptedMetadata, true);

    await new Promise((resolve, reject) => {
      [slicer, encryptor, uploader].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(uploader).on('finish', resolve);
    });

    return resourceId;
  }

  async download<T: Data>(resourceId: string, options?: OutputOptions<T> = {}): Promise<T> {
    this.assert(READY, 'download a file');

    const { url, service } = await this._session._client.send('get file download url', { // eslint-disable-line no-underscore-dangle
      resource_id: resourceId,
    });

    if (service !== 'GCS')
      throw new errors.InternalError(`unsupported storage service: ${service}`);

    const downloadChunkSize = 1024 * 1024;
    const downloader = new DownloadStream(url, downloadChunkSize, true);

    const encryptedMetadata = await downloader.getMetadata();
    const metadata = JSON.parse(await this.decrypt(fromBase64(encryptedMetadata)));
    const noInput = new Uint8Array(0); // when downloading there's no input available to define default output type
    const outputOptions = makeOutputOptions(noInput, { type: File, ...options, ...metadata });
    const merger = new MergerStream(outputOptions);

    const decryptor = await this._session.apis.dataProtector.makeDecryptorStream();

    return new Promise((resolve, reject) => {
      [downloader, decryptor, merger].forEach(s => s.on('error', reject));
      downloader.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }
}

export type { b64string } from '@tanker/core';
export { errors, fromBase64, toBase64 } from '@tanker/core';
export { Tanker };
export default Tanker;
