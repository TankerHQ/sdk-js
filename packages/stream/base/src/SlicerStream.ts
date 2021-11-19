import { Readable } from 'readable-stream';

// WARNING: don't import the File ponyfill here! We want to test against the real
//          File constructor, for both real and ponyfilled files to be accepted.
import { InvalidArgument } from '@tanker/errors';
import FileReader from '@tanker/file-reader';
import { assertDataType } from '@tanker/types';

type ExternalSource = ArrayBuffer | Buffer | Uint8Array | Blob | File;
type InternalSource = Uint8Array | Blob | File;

export default class SlicerStream extends Readable {
  _mode!: 'binary' | 'file';
  _source!: InternalSource;
  _outputSize: number = 5 * 1024 * 1024; // 5MB

  _readingState!: {
    byteSize: number;
    byteIndex: number;
    readInProgress: boolean;
  };

  _fileReader!: FileReader;

  constructor(options: { source: ExternalSource; outputSize?: number; }) {
    super({
      // buffering a single output chunk
      objectMode: true,
      highWaterMark: 1,
    });

    if (!options || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype)
      throw new InvalidArgument('options', 'object', options);

    const { source, outputSize } = options;

    assertDataType(source, 'options.source');

    if (outputSize && typeof outputSize !== 'number')
      throw new InvalidArgument('options.outputSize', 'number', outputSize);

    if (outputSize) {
      this._outputSize = outputSize;
    }

    if (source instanceof ArrayBuffer || source instanceof Uint8Array) { // also catches Buffer
      this._initBinaryMode(source);
    } else {
      this._initFileMode(source);
    }
  }

  override _read = async (/* size: number */) => {
    if (this._readingState.readInProgress)
      return;
    this._readingState.readInProgress = true;

    try {
      if (this._mode === 'binary') {
        while (this._readBinary());
      } else {
        while (await this._readFile());
      }
    } catch (error) {
      this.destroy(error as Error);
      return;
    } finally {
      this._readingState.readInProgress = false;
    }
  };

  /**
   * Binary mode
   */

  _initBinaryMode = (source: ArrayBuffer | Buffer | Uint8Array) => {
    this._mode = 'binary';
    this._source = source instanceof ArrayBuffer ? new Uint8Array(source) : source;
    this._readingState = {
      byteSize: this._source.length,
      byteIndex: 0,
      readInProgress: false,
    };
  };

  _readBinary = () => {
    const { byteSize, byteIndex: startIndex } = this._readingState;
    const endIndex = Math.min(startIndex + this._outputSize, byteSize);

    const bytes = (this._source as Uint8Array).subarray(startIndex, endIndex);
    const pushMore = this.push(bytes);

    this._readingState.byteIndex = endIndex;
    if (endIndex === byteSize) {
      this.push(null);
      return false;
    }

    return pushMore;
  };

  /**
   * File mode
   */

  _initFileMode = (source: Blob | File) => {
    this._mode = 'file';
    this._source = source;
    this._fileReader = new FileReader(source);
    this._readingState = {
      byteSize: 0,
      byteIndex: 0,
      readInProgress: false,
    };
  };

  _readFile = async () => {
    const buffer = await this._fileReader.readAsArrayBuffer(this._outputSize);
    const length = buffer.byteLength;

    if (length === 0) {
      this.push(null);
      return false;
    }

    const pushMore = this.push(new Uint8Array(buffer));

    if (length < this._outputSize) {
      this.push(null);
      return false;
    }

    return pushMore;
  };
}
