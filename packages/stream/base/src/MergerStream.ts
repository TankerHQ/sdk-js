import { InvalidArgument } from '@tanker/errors';
import type { ResourceMetadata, Data, Class } from '@tanker/types';
import { assertDataTypeClass, castData } from '@tanker/types';

import ResizerStream from './ResizerStream';

export default class MergerStream<T extends Data> extends ResizerStream {
  _options: { type: Class<T> } & ResourceMetadata;

  constructor(options: { type: Class<T> } & ResourceMetadata) {
    // Note: can't use Infinity as it will be forwarded to the writableHighWaterMark option
    super(Number.MAX_SAFE_INTEGER);

    // $FlowIgnore Use of Object.prototype
    if (!options || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype)
      throw new InvalidArgument('options', 'object', options);

    const { type, mime, name, lastModified } = options;

    assertDataTypeClass(type, 'options.type');

    if (mime && typeof mime !== 'string')
      throw new InvalidArgument('options.mime', 'string', mime);

    if (name && typeof name !== 'string')
      throw new InvalidArgument('options.name', 'string', name);

    if (lastModified && typeof lastModified !== 'number')
      throw new InvalidArgument('options.lastModified', 'number', lastModified);

    this._options = options;
  }

  override async _pushLastChunk() {
    // Always push last chunk even if zero bytes
    const uint8array = this._buffer.consume(this._buffer.byteSize());
    const lastChunk = await castData(uint8array, this._options);
    this.push(lastChunk);
  }
}
