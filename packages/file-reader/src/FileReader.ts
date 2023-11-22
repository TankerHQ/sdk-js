import { globalThis } from '@tanker/global-this';

type FileReaderResolver = ((data: string) => void) | ((data: ArrayBuffer) => void);

export class FileReader {
  _source: Blob;
  _reader: globalThis.FileReader;
  _readPositions: {
    start: number;
    end: number;
  } = { start: 0, end: 0 };

  _currentRead: {
    resolve: FileReaderResolver;
    reject: (err: Error) => void;
  } | undefined;

  constructor(source: Blob | File) {
    this._source = source;

    this._reader = new globalThis.FileReader();

    this._reader.addEventListener('load', this._onLoad.bind(this));
    this._reader.addEventListener('error', this._onError.bind(this));
    this._reader.addEventListener('abort', this._onError.bind(this));
  }

  _onLoad() {
    if (!this._currentRead)
      throw new Error('Assertion error: a result was received but no read operation was in progress');

    const { resolve } = this._currentRead;
    this._currentRead = undefined;
    // we know for sure that `resolve()` accepts `this._reader.result!` as argument
    resolve(this._reader.result! as any);
  }

  _onError() {
    // Ignore errors if no current read (happens in Safari because calling abort() will trigger
    // both 'abort' and 'error' events, whereas no 'error' event is fired in other browsers)
    if (!this._currentRead) {
      return;
    }

    const { reject } = this._currentRead;
    this._currentRead = undefined;
    reject(this._reader.error!);
  }

  _assertNoReadInProgress() {
    if (this._currentRead)
      throw new Error('Assertion error: a read operation is already in progress');
  }

  abort() {
    return this._reader.abort();
  }

  async readAsDataURL(): Promise<string> {
    this._assertNoReadInProgress();

    return new Promise((resolve, reject) => {
      this._currentRead = { resolve, reject };
      this._reader.readAsDataURL(this._source);
    });
  }

  async readAsText(encoding?: string): Promise<string> {
    this._assertNoReadInProgress();

    return new Promise((resolve, reject) => {
      this._currentRead = { resolve, reject };
      this._reader.readAsText(this._source, encoding);
    });
  }

  async readAsArrayBuffer(byteSize?: number): Promise<ArrayBuffer> {
    this._assertNoReadInProgress();

    const start = this._readPositions.end;
    const end = byteSize ? Math.min(start + byteSize, this._source.size) : this._source.size;

    this._readPositions = { start, end };

    // @ts-expect-error cross-browser compat
    const blobSlice = Blob.prototype.slice || Blob.prototype.mozSlice || Blob.prototype.webkitSlice;

    return new Promise((resolve, reject) => {
      this._currentRead = { resolve, reject };
      this._reader.readAsArrayBuffer(blobSlice.call(this._source, start, end));
    });
  }
}
