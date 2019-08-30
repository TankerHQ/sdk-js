// @flow
import { InvalidArgument } from '@tanker/errors';
import { assertDataTypeClass, castData } from '@tanker/types';

import ResizerStream from './ResizerStream';

type Destination = ArrayBuffer | Blob | Buffer | File | Uint8Array;

export default class MergerStream<T: Destination> extends ResizerStream {
  _options: { type: Class<T>, mime?: string, name?: string, lastModified?: number };

  constructor(options: { type: Class<T>, mime?: string, name?: string, lastModified?: number }) {
    // Note: can't use Infinity as it will be forwarded to the writableHighWaterMark option
    super(Number.MAX_SAFE_INTEGER);

    // $FlowIKnow Use of Object.prototype
    if (!options || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype)
      throw new InvalidArgument('options', 'object', options);

    const { type, mime, name, lastModified } = options;

    assertDataTypeClass(type, 'options.type');

    if (mime && typeof mime !== 'string')
      throw new InvalidArgument('options.mime', 'string', mime);

    if (name && typeof name !== 'string')
      throw new InvalidArgument('options.name', 'string', name);

    if (lastModified && typeof lastModified !== 'number')
      throw new InvalidArgument('options.lastModified', 'string', lastModified);

    this._options = options;
  }

  async _pushLastChunk() {
    if (this._buffer.byteSize()) {
      const uint8array = this._buffer.consume(this._buffer.byteSize());
      const lastChunk = await castData(uint8array, this._options);
      this.push(lastChunk);
    }
  }
}
