// @flow
import { errors } from '@tanker/core';
import { Readable } from '@tanker/stream-browser';

import { simpleFetch } from '../http';

export class DownloadStream extends Readable {
  _chunkSize: number;
  _downloadedLength: number;
  _totalLength: number;
  _url: string;
  _verbose: bool;

  constructor(url: string, chunkSize: number, verbose: bool = false) {
    super({
      objectMode: true
    });

    this._downloadedLength = 0;
    this._chunkSize = chunkSize;
    this._totalLength = 0;
    this._url = url;
    this._verbose = verbose;
  }

  log(message: string) {
    if (this._verbose) {
      console.log(`[DownloadStream] ${message}`); // eslint-disable-line no-console
    }
  }

  async getMetadata() {
    const response = await simpleFetch(this._url, {
      method: 'HEAD',
      responseType: 'arraybuffer',
    });

    const { ok, status, statusText, body, headers } = response;
    // Note: status is usually 206 Partial Content
    if (!ok) {
      throw new errors.NetworkError(`GCS download request failed with status ${status}: ${statusText}`);
    }

    const metadata = headers['x-goog-meta-tanker-metadata'];
    return metadata;
  }

  async _read(/* size: number */) {
    let result;

    try {
      const prevLength = this._downloadedLength;
      const nextLength = prevLength + this._chunkSize;

      const rangeHeader = `bytes=${prevLength}-${nextLength - 1}`;

      this.log(`downloading chunk of size ${this._chunkSize} with header "Range: ${rangeHeader}"`);

      const response = await simpleFetch(this._url, {
        method: 'GET',
        headers: { Range: rangeHeader },
        responseType: 'arraybuffer',
      });

      const { ok, status, statusText, body, headers } = response;
      // Note: status is usually 206 Partial Content
      if (!ok) {
        throw new errors.NetworkError(`GCS download request failed with status ${status}: ${statusText}`);
      }

      if (!this._totalLength) {
        const header = headers['content-range']; // e.g. "bytes 786432-1048575/1048698"
        this._totalLength = parseInt(header.split('/')[1], 0);
        this.log(`found total length ${this._totalLength}`);
      }

      result = new Uint8Array(body);

      this.log(`received chunk of size ${result.length} and status ${status}`);
      this._downloadedLength += result.length;
    } catch (e) {
      this.emit('error', e);
      return;
    }

    this.push(result); // success

    if (
      (this._totalLength && this._downloadedLength === this._totalLength)
      || (result.length < this._chunkSize)
    ) {
      this.push(null); // end
    }
  }
}

export default DownloadStream;
