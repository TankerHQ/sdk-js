// @flow
import { utils, type b64string } from '@tanker/crypto';
import streamCloudStorage from '@tanker/stream-cloud-storage';
import { getDataLength } from '@tanker/types';
import type { Data } from '@tanker/types';

import { InternalError, InvalidArgument, NetworkError } from '../errors';
import type { Client } from '../Network/Client';
import type { DataProtector, Streams } from '../DataProtection/DataProtector';
import { defaultDownloadType, extractOptions } from '../DataProtection/options';
import type { OutputOptions, ShareWithOptions } from '../DataProtection/options';

export class CloudStorageManager {
  _client: Client;
  _dataProtector: DataProtector;
  _streams: Streams;

  constructor(
    client: Client,
    dataProtector: DataProtector,
    streams: Streams,
  ) {
    this._client = client;
    this._dataProtector = dataProtector;
    this._streams = streams;
  }

  async _encryptAndShareMetadata(metadata: Object, sharingOptions: ShareWithOptions): Promise<b64string> {
    const jsonMetadata = JSON.stringify(metadata);
    const clearMetadata = utils.fromString(jsonMetadata);
    const encryptedMetadata = await this._dataProtector.encryptData(clearMetadata, sharingOptions, { type: Uint8Array });
    return utils.toBase64(encryptedMetadata);
  }

  async _decryptMetadata(b64EncryptedMetadata: b64string): Promise<*> {
    const ecryptedMetadata = utils.fromBase64(b64EncryptedMetadata);
    const decryptedMetadata = await this._dataProtector.decryptData(ecryptedMetadata, { type: Uint8Array });
    const jsonMetadata = utils.toString(decryptedMetadata);
    return JSON.parse(jsonMetadata);
  }

  async upload<T: Data>(clearData: Data, sharingOptions: ShareWithOptions, outputOptions: OutputOptions<T>): Promise<string> {
    const encryptor = await this._dataProtector.makeEncryptorStream(sharingOptions);

    const { clearChunkSize, encryptedChunkSize, overheadPerChunk, resourceId } = encryptor;
    const totalClearSize = getDataLength(clearData);
    const lastClearChunkSize = totalClearSize % clearChunkSize;
    const totalEncryptedSize = Math.floor(totalClearSize / clearChunkSize) * encryptedChunkSize + lastClearChunkSize + overheadPerChunk;

    const { url, headers, service } = await this._client.send('get file upload url', {
      resource_id: resourceId,
      upload_content_length: totalEncryptedSize,
    });

    if (!streamCloudStorage[service])
      throw new InternalError(`unsupported cloud storage service: ${service}`);

    const { UploadStream } = streamCloudStorage[service];

    const { type, ...metadata } = outputOptions;
    const encryptedMetadata = await this._encryptAndShareMetadata(metadata, sharingOptions);

    const slicer = new this._streams.SlicerStream({ source: clearData });
    const uploader = new UploadStream(url, headers, totalEncryptedSize, encryptedMetadata);

    await new Promise((resolve, reject) => {
      [slicer, encryptor, uploader].forEach(s => s.on('error', reject));
      slicer.pipe(encryptor).pipe(uploader).on('finish', resolve);
    });

    return resourceId;
  }

  async download<T: Data>(resourceId: string, options?: $Shape<OutputOptions<T>> = {}): Promise<T> {
    const { url, service } = await this._client.send('get file download url', { // eslint-disable-line no-underscore-dangle
      resource_id: resourceId,
    });

    if (!streamCloudStorage[service])
      throw new InternalError(`unsupported cloud storage service: ${service}`);

    const { DownloadStream } = streamCloudStorage[service];

    const downloadChunkSize = 1024 * 1024;
    const downloader = new DownloadStream(url, downloadChunkSize);

    let encryptedMetadata;
    try {
      encryptedMetadata = await downloader.getMetadata();
    } catch (e) {
      if (e instanceof NetworkError && e.message.match(/404/)) {
        throw new InvalidArgument(`Could not find any uploaded file that matches the provided resourceId: ${resourceId}`);
      }
      throw e;
    }

    const metadata = await this._decryptMetadata(encryptedMetadata);
    const { outputOptions } = extractOptions({ type: defaultDownloadType, ...options, ...metadata });
    const merger = new this._streams.MergerStream(outputOptions);

    const decryptor = await this._dataProtector.makeDecryptorStream();

    return new Promise((resolve, reject) => {
      [downloader, decryptor, merger].forEach(s => s.on('error', reject));
      downloader.pipe(decryptor).pipe(merger).on('data', resolve);
    });
  }
}

export default CloudStorageManager;
