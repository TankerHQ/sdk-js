// @flow
import { utils, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';
import { MergerStream, ResizerStream, SlicerStream } from '@tanker/stream-base';
import type { Readable, Writable } from '@tanker/stream-base';
import streamCloudStorage from '@tanker/stream-cloud-storage';
import { getDataLength } from '@tanker/types';
import type { Data } from '@tanker/types';

import type { Client } from '../Network/Client';
import { getStreamEncryptionFormatDescription, getClearSize } from '../DataProtection/Resource';
import type { DataProtector } from '../DataProtection/DataProtector';
import { defaultDownloadType, extractOutputOptions } from '../DataProtection/options';
import { ProgressHandler } from '../DataProtection/ProgressHandler';
import type { OutputOptions, ProgressOptions, SharingOptions } from '../DataProtection/options';

const pipeStreams = (
  { streams, resolveEvent }: { streams: Array<Readable | Writable>, resolveEvent: string }
) => new Promise((resolve, reject) => {
  streams.forEach(stream => stream.on('error', reject));
  streams.reduce((leftStream, rightStream) => leftStream.pipe(rightStream)).on(resolveEvent, resolve);
});

// Detection of: Edge | Edge iOS | Edge Android - but not Edge (Chromium-based)
const isEdge = () => /(edge|edgios|edga)\//i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);

export class CloudStorageManager {
  _client: Client;
  _dataProtector: DataProtector;

  constructor(
    client: Client,
    dataProtector: DataProtector,
  ) {
    this._client = client;
    this._dataProtector = dataProtector;
  }

  async _encryptAndShareMetadata(metadata: Object, b64ResourceId: b64string): Promise<b64string> {
    const jsonMetadata = JSON.stringify(metadata);
    const clearMetadata = utils.fromString(jsonMetadata);
    const encryptedMetadata = await this._dataProtector.encryptData(clearMetadata, {}, { type: Uint8Array }, {}, b64ResourceId);
    return utils.toBase64(encryptedMetadata);
  }

  async _decryptMetadata(b64EncryptedMetadata: b64string): Promise<*> {
    const ecryptedMetadata = utils.fromBase64(b64EncryptedMetadata);
    const decryptedMetadata = await this._dataProtector.decryptData(ecryptedMetadata, { type: Uint8Array }, {});
    const jsonMetadata = utils.toString(decryptedMetadata);
    return JSON.parse(jsonMetadata);
  }

  async upload<T: Data>(clearData: Data, sharingOptions: SharingOptions, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<string> {
    const encryptor = await this._dataProtector.makeEncryptorStream(sharingOptions);
    const { resourceId } = encryptor;

    const totalClearSize = getDataLength(clearData);
    const totalEncryptedSize = encryptor.getEncryptedSize(totalClearSize);

    const { type, ...fileMetadata } = outputOptions;
    // clearContentLength shouldn't be used since we may not have that
    // information. We leave it here only for compatibility with older SDKs
    const metadata = { ...fileMetadata, clearContentLength: totalClearSize, encryptionFormat: getStreamEncryptionFormatDescription() };
    const encryptedMetadata = await this._encryptAndShareMetadata(metadata, resourceId);

    const {
      urls,
      headers,
      service,
      recommended_chunk_size: recommendedChunkSize
    } = await this._client.send('get file upload url', {
      resource_id: resourceId,
      metadata: encryptedMetadata,
      upload_content_length: totalEncryptedSize,
    });

    if (!streamCloudStorage[service])
      throw new InternalError(`unsupported cloud storage service: ${service}`);

    const streamService = streamCloudStorage[service];
    const { UploadStream } = streamService;

    const slicer = new SlicerStream({ source: clearData });
    const uploader = new UploadStream(urls, headers, totalEncryptedSize, recommendedChunkSize, encryptedMetadata);

    const progressHandler = new ProgressHandler(progressOptions).start(totalEncryptedSize);
    uploader.on('uploaded', (chunk: Uint8Array) => progressHandler.report(chunk.byteLength));

    const streams = [slicer, encryptor];

    // Some version of Edge (e.g. version 18) fail to handle the 308 HTTP status used by
    // GCS in a non-standard way (no redirection expected) when uploading in chunks. So we
    // add a merger stream before the uploader to ensure there's a single upload request
    // returning the 200 HTTP status.
    if (service === 'GCS' && isEdge()) {
      const merger = new MergerStream({ type: Uint8Array });
      streams.push(merger);
    } else if (service === 'S3') {
      const resizer = new ResizerStream(recommendedChunkSize);
      streams.push(resizer);
    }

    streams.push(uploader);

    await pipeStreams({ streams, resolveEvent: 'finish' });

    return resourceId;
  }

  async download<T: Data>(resourceId: string, outputOptions: OutputOptions<T>, progressOptions: ProgressOptions): Promise<T> {
    const { head_url: headUrl, get_url: getUrl, service } = await this._client.send('get file download url', { // eslint-disable-line no-underscore-dangle
      resource_id: resourceId,
    });

    if (!streamCloudStorage[service])
      throw new InternalError(`unsupported cloud storage service: ${service}`);

    const { DownloadStream } = streamCloudStorage[service];

    const downloadChunkSize = 1024 * 1024;
    const downloader = new DownloadStream(resourceId, headUrl, getUrl, downloadChunkSize);

    const { metadata: encryptedMetadata, encryptedContentLength } = await downloader.getMetadata();
    const { encryptionFormat, clearContentLength, ...fileMetadata } = await this._decryptMetadata(encryptedMetadata);
    const combinedOutputOptions = extractOutputOptions({ type: defaultDownloadType, ...outputOptions, ...fileMetadata });
    const merger = new MergerStream(combinedOutputOptions);

    const decryptor = await this._dataProtector.makeDecryptorStream();

    // for compatibility
    const clearSize = encryptionFormat
      ? getClearSize(encryptionFormat, encryptedContentLength)
      : clearContentLength;
    const progressHandler = new ProgressHandler(progressOptions).start(clearSize);
    decryptor.on('data', (chunk: Uint8Array) => progressHandler.report(chunk.byteLength));

    return pipeStreams({ streams: [downloader, decryptor, merger], resolveEvent: 'data' });
  }
}

export default CloudStorageManager;
