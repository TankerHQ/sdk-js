// @flow
import { InvalidArgument, NetworkError } from '@tanker/errors';
import { Readable } from '@tanker/stream-base';

import { fetch } from '../fetch';
import { retry } from '../retry';

export class DownloadStream extends Readable {
  _chunkSize: number;
  _downloadedLength: number;
  _resourceId: string;
  _totalLength: number;
  _url: string;
  _verbose: bool;

  constructor(resourceId: string, url: string, chunkSize: number, verbose: bool = false) {
    super({
      objectMode: true
    });

    this._downloadedLength = 0;
    this._chunkSize = chunkSize;
    this._resourceId = resourceId;
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
    const response = await fetch(this._url, { method: 'HEAD' });

    const { ok, status, statusText, headers } = response;
    if (!ok) {
      if (status === 404) {
        throw new InvalidArgument(`Could not find any uploaded file that matches the provided resourceId: ${this._resourceId}`);
      } else {
        throw new NetworkError(`GCS metadata head request failed with status ${status}: ${statusText}`);
      }
    }

    const metadata = headers.get('x-goog-meta-tanker-metadata');
    return metadata;
  }

  async _read(/* size: number */) {
    let result;

    try {
      const prevLength = this._downloadedLength;
      const nextLength = prevLength + this._chunkSize;

      const rangeHeader = `bytes=${prevLength}-${nextLength - 1}`;

      const response = await retry(async () => {
        this.log(`downloading chunk of size ${this._chunkSize} with header "Range: ${rangeHeader}"`);

        const resp = await fetch(this._url, {
          method: 'GET',
          headers: { Range: rangeHeader },
        });

        const { ok, status, statusText } = resp;
        // Note: status is usually 206 Partial Content
        if (!ok) {
          throw new NetworkError(`GCS download request failed with status ${status}: ${statusText}`);
        }

        return resp;
      }, {
        retries: 2,
      });

      const { status, headers } = response;
      const body = await response.arrayBuffer();

      result = new Uint8Array(body);

      if (!this._totalLength) {
        // Partial content: file is incomplete (i.e. bigger than chunkSize)
        if (status === 206) {
          const header = headers.get('content-range'); // e.g. "bytes 786432-1048575/1048698"

          if (typeof header !== 'string' || !header.match(/^bytes +\d+-\d+\/\d+$/)) {
            throw new NetworkError(`GCS answered with status 206 but an invalid content-range header: ${header}`);
          }

          this._totalLength = parseInt(header.split('/')[1], 0);
        } else {
          this._totalLength = result.length;
        }

        this.log(`found total length ${this._totalLength}`);
      }

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
