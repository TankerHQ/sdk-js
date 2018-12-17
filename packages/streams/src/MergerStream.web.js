// @flow
import { InvalidArgument } from '@tanker/errors';

import FilePolyfill from './File.polyfill.web';
import ResizerStream from './ResizerStream';
import Uint8Buffer from './Uint8Buffer';

type OutputType = 'ArrayBuffer' | 'Uint8Array' | 'Blob' | 'File';

export default class MergerStream extends ResizerStream {
  _buffer: Uint8Buffer = new Uint8Buffer();
  _filename: string;
  _mime: string;
  _type: OutputType;

  constructor(options: { type?: OutputType, mime?: string, filename?: string } = {}) {
    if (typeof options !== 'object' || options instanceof Array)
      throw new InvalidArgument('options', 'object', options);

    const { type, mime, filename } = options;

    if (type !== undefined) {
      const allowedTypes = ['ArrayBuffer', 'Uint8Array', 'Blob', 'File'];

      if (allowedTypes.indexOf(type) === -1) {
        throw new InvalidArgument('options.type', 'string in ["ArrayBuffer", "Uint8Array", "Blob", "File"]', type);
      }
    }

    if (mime && typeof mime !== 'string')
      throw new InvalidArgument('options.mime', 'string', mime);

    if (filename && typeof filename !== 'string')
      throw new InvalidArgument('options.filename', 'string', filename);

    // Note: can't use Infinity as it will be forwarded to the writableHighWaterMark option
    super(Number.MAX_SAFE_INTEGER);

    this._filename = filename || '';
    this._mime = mime || 'application/octet-stream';
    this._type = type || 'Uint8Array';
  }

  _pushLastChunk() {
    if (this._buffer.byteSize()) {
      const uint8array = this._buffer.consume(this._buffer.byteSize());

      switch (this._type) {
        case 'ArrayBuffer':
          this.push(uint8array.buffer);
          break;
        case 'Uint8Array':
          this.push(uint8array);
          break;
        case 'Blob':
          this.push(new Blob([uint8array], { type: this._mime }));
          break;
        case 'File':
          this.push(new FilePolyfill([uint8array], this._filename, { type: this._mime }));
          break;
        default:
          throw new Error('Assertion error: invalid _type in MergerStream');
      }
    }
  }
}
