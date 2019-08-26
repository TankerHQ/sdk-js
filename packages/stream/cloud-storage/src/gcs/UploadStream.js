// @flow
import { InvalidArgument, NetworkError } from '@tanker/errors';
import { Writable } from '@tanker/stream-base';

import { fetch } from '../fetch';
import { retry } from '../retry';

const GCSUploadSizeIncrement = 256 * 1024; // 256KiB

export class UploadStream extends Writable {
  _contentLength: number;
  _headers: Object;
  _initializing: Promise<void>;
  _initUrl: string;
  _uploadUrl: string;
  _uploadedLength: number;
  _verbose: bool;

  constructor(urls: Array<string>, headers: Object, contentLength: number, _recommendedChunkSize: number, encryptedMetadata: string, verbose: bool = false) {
    super({
      highWaterMark: 1,
      objectMode: true
    });

    this._initUrl = urls[0];
    this._headers = { ...headers, 'x-goog-meta-tanker-metadata': encryptedMetadata };
    this._contentLength = contentLength;
    this._uploadedLength = 0;
    this._verbose = verbose;

    this._initializing = this.initialize();
  }

  log(message: string) {
    if (this._verbose) {
      console.log(`[UploadStream] ${message}`); // eslint-disable-line no-console
    }
  }

  async initialize() {
    this.log('initializing...');

    const { ok, status, statusText, headers } = await fetch(this._initUrl, { method: 'POST', headers: this._headers });
    if (!ok) {
      throw new NetworkError(`GCS init request failed with status ${status}: ${statusText}`);
    }
    this._uploadUrl = headers.get('location');
    this.log(`using upload URL ${this._uploadUrl}`);
  }

  async _write(chunk: Uint8Array, encoding: ?string, callback: Function) {
    try {
      await this._initializing;

      const chunkLength = chunk.length;
      const prevLength = this._uploadedLength;
      const nextLength = prevLength + chunkLength;

      const lastChunk = nextLength >= this._contentLength;

      if (!lastChunk && chunkLength % GCSUploadSizeIncrement !== 0) {
        throw new InvalidArgument(`GCS upload request with invalid chunk length: ${chunkLength} (not multiple of 256KiB)`);
      }

      const contentRangeHeader = `bytes ${prevLength}-${nextLength - 1}/${lastChunk ? this._contentLength : '*'}`;

      await retry(async () => {
        this.log(`uploading chunk of size ${chunkLength} with header "Content-Range: ${contentRangeHeader}"`);

        const response = await fetch(this._uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Range': contentRangeHeader },
          body: chunk,
        });

        const { ok, status, statusText } = response;
        const success = (lastChunk && ok) || (!lastChunk && status === 308);
        if (!success) {
          throw new NetworkError(`GCS upload request failed with status ${status}: ${statusText}`);
        }

        this._uploadedLength += chunkLength;
      }, {
        retries: 2,
      });

      this.emit('uploaded', chunk);
    } catch (e) {
      return callback(e);
    }

    callback(null); // success
  }
}

export default UploadStream;
