// @flow
import type { TankerOptions, ShareWithOptions, b64string } from '@tanker/core';
import { Tanker as TankerCore, errors, statuses, optionsWithDefaults, getEncryptionFormat, fromString, toString, assertShareWithOptions } from '@tanker/core';
import { MergerStream, SlicerStream } from '@tanker/stream-browser';
import Dexie from '@tanker/datastore-dexie-browser';

import { assertDataType, getDataLength, castData, type Data } from './dataHelpers';
import { simpleFetch } from './http';
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
    const encryptedFile = await this.encryptData(clearData, { ...options, type: File });
    const encryptedFileLength = encryptedFile.size;

    const resourceId = await this.getResourceId(encryptedFile);

    const { url, headers } = await this._session._client.send('get file upload url', { // eslint-disable-line no-underscore-dangle
      resource_id: resourceId,
      upload_content_length: encryptedFileLength,
    });

    let response = await simpleFetch(url, { method: 'POST', headers });
    if (!response.ok) {
      throw new errors.NetworkError(`Request failed with status: ${response.status}`);
    }
    const uploadUrl = response.headers.location;

    response = await simpleFetch(uploadUrl, { method: 'PUT', headers, body: encryptedFile });
    if (!response.ok) {
      throw new errors.NetworkError(`Request failed with status: ${response.status}`);
    }

    return resourceId;
  }

  async download<T: Data>(resourceId: string, options?: OutputOptions<T> = {}): Promise<T> {
    const { url } = await this._session._client.send('get file download url', { // eslint-disable-line no-underscore-dangle
      resource_id: resourceId,
    });

    const response = await simpleFetch(url, { method: 'GET', responseType: 'blob' });
    if (!response.ok) {
      throw new errors.NetworkError(`Request failed with status: ${response.status}`);
    }

    // $FlowIKnow Defaulting to File output type breaks the Promise<T> assumption
    const file = await this.decryptData(response.body, { type: File, ...options });
    return file;
  }
}

export type { b64string } from '@tanker/core';
export { errors, fromBase64, toBase64 } from '@tanker/core';
export { Tanker };
export default Tanker;
