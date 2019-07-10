// @flow

// WARNING: don't import the File ponyfill here! We want to test against the real
//          File constructor, for both real and ponyfilled files to be accepted.
import { InvalidArgument } from '@tanker/errors';
import FileReader from '@tanker/file-reader';
import { Readable } from '@tanker/stream-base';

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
  _fileReader: FileReader;

  constructor(options: { source: Source, outputSize?: number }) {
    if (!options || typeof options !== 'object' || options instanceof Array)
      throw new InvalidArgument('options', 'object', options);

    const { source, outputSize } = options;

    if ([ArrayBuffer, Uint8Array, Blob, File].every(constructor => !(source instanceof constructor)))
      throw new InvalidArgument('options.source', 'either an ArrayBuffer, a Uint8Array, a Blob, or a File', source);

    if (outputSize && typeof outputSize !== 'number')
      throw new InvalidArgument('options.outputSize', 'number', outputSize);

    super({
      // buffering a single output chunk
      objectMode: true,
      highWaterMark: 1,
    });

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
    this._fileReader = new FileReader(source);
  }

  _readFile = async () => {
    try {
      const buffer = await this._fileReader.readAsArrayBuffer(this._outputSize);
      const length = buffer.byteLength;

      if (length === 0) {
        this.push(null);
        return;
      }

      this.push(new Uint8Array(buffer));

      if (length < this._outputSize) {
        this.push(null);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }
}
