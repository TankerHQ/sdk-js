import { InvalidArgument, InternalError, NetworkError } from '@tanker/errors';
import { fetch, retry } from '@tanker/http-utils';
import { Writable } from '@tanker/stream-base';
import type { WriteCallback } from '@tanker/stream-base';

export class UploadStream extends Writable {
  _contentLength: number;
  _headers: Record<string, any>;
  _urls: Array<string>;
  _completeUrl: string;
  _uploadedPartETags: Array<string> = [];
  _uploadedLength: number = 0;
  _recommendedChunkSize: number;
  _verbose: boolean;

  constructor(urls: Array<string>, headers: Record<string, any>, contentLength: number, recommendedChunkSize: number, verbose: boolean = false) {
    super({
      highWaterMark: 1,
      objectMode: true,
    });

    if (urls.length === 0)
      throw new InternalError(`S3 upload request with invalid number of signed chunk URLs: ${urls.length}`);
    this._urls = urls.slice(0, -1);
    this._completeUrl = urls[urls.length - 1]!;
    this._headers = headers;
    this._contentLength = contentLength;
    this._recommendedChunkSize = recommendedChunkSize;
    this._verbose = verbose;

    const expectedNumChunks = Math.ceil(this._contentLength / this._recommendedChunkSize);
    if (this._urls.length !== expectedNumChunks)
      throw new InternalError(`S3 upload request with invalid number of signed chunk URLs: ${this._urls.length} but expected ${expectedNumChunks}`);
  }

  log(message: string) {
    if (this._verbose) {
      console.log(`[UploadStream] ${message}`); // eslint-disable-line no-console
    }
  }

  override async _write(chunk: Uint8Array, _: string, done: WriteCallback) {
    try {
      const chunkLength = chunk.length;
      const prevLength = this._uploadedLength;
      const nextLength = prevLength + chunkLength;

      const curChunkIndex = prevLength / this._recommendedChunkSize;

      const lastChunk = nextLength === this._contentLength;

      if (nextLength > this._contentLength)
        throw new InvalidArgument('Cannot write to an S3 upload stream past the content length.');
      if (!lastChunk && chunkLength !== this._recommendedChunkSize)
        throw new InvalidArgument(`S3 upload request with invalid chunk length: ${chunkLength} (must be ${this._recommendedChunkSize})`);

      await retry(async () => {
        this.log(`uploading chunk ${curChunkIndex} of size ${chunkLength}`);

        const response = await fetch(this._urls[curChunkIndex]!, {
          method: 'PUT',
          body: chunk,
        });

        const { ok, status, statusText } = response;
        if (!ok) {
          throw new NetworkError(`S3 upload request failed with status ${status}: ${statusText}`);
        }

        this._uploadedPartETags.push(response.headers.get('etag')!);
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

  override async _final(done: WriteCallback) {
    try {
      await retry(async () => {
        this.log(`Completing S3 multipart upload of size ${this._contentLength}`);

        const body = this.makeCompleteMultipartUploadBody();
        const response = await fetch(this._completeUrl, {
          method: 'POST',
          body,
        });
        const { ok, status, statusText } = response;
        if (!ok)
          throw new NetworkError(`S3 upload complete request failed with status ${status}: ${statusText}`);
      }, {
        retries: 2,
      });
    } catch (e) {
      return done(e as Error);
    }

    done(null);
  }

  makeCompleteMultipartUploadBody(): string {
    const partsXML = this._uploadedPartETags.map((etag, idx) => `<Part><PartNumber>${idx + 1}</PartNumber><ETag>${etag}</ETag></Part>`);

    return `<CompleteMultipartUpload>\n${partsXML.join('\n')}\n</CompleteMultipartUpload>`;
  }
}

export default UploadStream;
