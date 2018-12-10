// @flow

// WARNING: don't import the File polyfill here! We want to test against the real
//          File constructor, for both real and polyfilled files to be accepted.
import { Readable } from 'readable-stream';

type Source = ArrayBuffer | Uint8Array | Blob | File;

export default class SlicerStream extends Readable {
  _mode: 'binary' | 'file';
  _source: Uint8Array | Blob | File;
  _outputSize: number;
  _readingState: {
    byteSize: number,
    byteIndex: number,
    readInProgress?: bool,
  };
  // $FlowIKnow vendor prefixes
  _fileSlice: Function = Blob.prototype.slice || Blob.prototype.mozSlice || Blob.prototype.webkitSlice;
  _fileReader: FileReader = new FileReader();

  constructor(options: { source: Source, outputSize?: number }) {
    super({
      objectMode: true,
    });

    const { source, outputSize } = options;

    if ([ArrayBuffer, Uint8Array, Blob, File].every(constructor => !(source instanceof constructor)))
      throw new Error(`InvalidArgument: source should be one of [ArrayBuffer, Uint8Array, Blob, File] but was ${typeof source}`);

    this._outputSize = outputSize || 5 * 1024 * 1024; // 5MB

    if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
      this._initBinaryMode(source);
    } else {
      this._initFileMode(source);
    }
  }

  _read = (/* size: number */) => {
    if (this._mode === 'binary') {
      this._readBinary();
    } else {
      this._readFile();
    }
  }

  /**
   * Binary mode
   */

  _initBinaryMode = (source: ArrayBuffer | Uint8Array) => {
    this._mode = 'binary';
    this._source = source instanceof ArrayBuffer ? new Uint8Array(source) : source;
    this._readingState = {
      byteSize: this._source.length,
      byteIndex: 0,
    };
  }

  _readBinary = () => {
    const { byteSize, byteIndex: startIndex } = this._readingState;
    const endIndex = Math.min(startIndex + this._outputSize, byteSize);

    // $FlowIKnow we know _source is an Uint8Array
    const bytes = this._source.subarray(startIndex, endIndex);
    const pushMore = this.push(bytes);

    if (endIndex >= byteSize) {
      this.push(null);
      return;
    }

    this._readingState.byteIndex = endIndex;

    if (pushMore) {
      this._readBinary();
    }
  }

  /**
   * File mode
   */

  _initFileMode = (source: Blob | File) => {
    this._mode = 'file';
    this._source = source;
    this._readingState = {
      byteSize: this._source.size,
      byteIndex: 0,
    };

    this._fileReader.addEventListener('load', (event: any) => this._readFileResult(event.target.result));
    this._fileReader.addEventListener('error', this._readFileError);
  }

  _readFile = () => {
    const { byteSize, byteIndex: startIndex } = this._readingState;

    const endIndex = Math.min(startIndex + this._outputSize, byteSize);
    this._readingState.byteIndex = endIndex;

    const byteWindow = this._fileSlice.call(this._source, startIndex, endIndex);
    this._fileReader.readAsArrayBuffer(byteWindow);
  }

  _readFileResult = (result: ArrayBuffer) => {
    this.push(new Uint8Array(result));

    const { byteSize, byteIndex } = this._readingState;

    if (byteIndex >= byteSize) {
      this.push(null);
    }
  }

  _readFileError = () => {
    this.emit('error', this._fileReader.error);
  }
}
