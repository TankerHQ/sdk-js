// @flow
import { InvalidArgument } from '@tanker/errors';
import { BaseMergerStream } from '@tanker/stream-base';

type Destination = ArrayBuffer | Buffer | Uint8Array;
const converters = {
  ArrayBuffer: (uint8array: Uint8Array) => (
    uint8array.buffer.byteLength === uint8array.length
      ? uint8array.buffer
      : (new Uint8Array(uint8array)).buffer
  ),
  Buffer: (uint8array: Uint8Array) => Buffer.from(uint8array.buffer),
  Uint8Array: (uint8array: Uint8Array) => uint8array,
};

export default class MergerStream<T: Destination = Uint8Array> extends BaseMergerStream<T> {
  // <T: A | B> is interpreted as 'T must be A or B at all times', not 'T cannot exist unless it is either A or B and should just not change after instantiation'
  // $FlowIssue https://github.com/facebook/flow/issues/7449
  constructor({ type = Uint8Array, ...otherOptions }: { type?: Class<T>, mime?: string, name?: string } = {}) {
    if (![ArrayBuffer, Buffer, Uint8Array].some(klass => type === klass))
      throw new InvalidArgument('options.type', 'class in [ArrayBuffer, Buffer, Uint8Array]', type);

    super({ ...otherOptions, type, converter: converters[type.name] });
  }
}
