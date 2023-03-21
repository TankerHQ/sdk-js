import { InternalError, InvalidArgument, NetworkError } from '@tanker/errors';
import { fetch, retry } from '@tanker/http-utils';
import { Writable } from '@tanker/stream-base';
import type { WriteCallback } from '@tanker/stream-base';

const gcsUploadSizeIncrement = 256 * 1024; // 256KiB

export class UploadStream extends Writable {
  _contentLength: number;
  _headers: Record<string, any>;
  _initializing: Promise<void>;
  _initUrl: string;
  _uploadUrl!: string;
  _uploadedLength: number;
  _verbose: boolean;

  constructor(urls: Array<string>, headers: Record<string, any>, contentLength: number, _recommendedChunkSize: number, verbose: boolean = false) {
    super({
      highWaterMark: 1,
      objectMode: true,
    });

    if (urls.length !== 1)
      throw new InternalError(`GCS upload request with invalid number of URLs: ${urls.length} expecting 1`);
    this._initUrl = urls[0]!;
    this._headers = { ...headers }; // copy

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

    this._uploadUrl = headers.get('location') || '';

    if (!this._uploadUrl) {
      throw new InternalError('GCS did not return an upload URL');
    }

    this.log(`using upload URL ${this._uploadUrl}`);
  }

  override async _write(chunk: Uint8Array, _: string, done: WriteCallback) {
    try {
      await this._initializing;

      const chunkLength = chunk.length;
      const prevLength = this._uploadedLength;
      const nextLength = prevLength + chunkLength;

      const lastChunk = nextLength === this._contentLength;

      if (nextLength > this._contentLength) {
        throw new InvalidArgument('Cannot write to a GCS upload stream past the content length.');
      }

      if (!lastChunk && chunkLength % gcsUploadSizeIncrement !== 0) {
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
      return done(e as Error);
    }

    done(null); // success
  }
}
