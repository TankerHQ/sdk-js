// @flow
import { InvalidArgument } from '@tanker/errors';
import { BaseMergerStream } from '@tanker/stream-base';
import { castData } from '@tanker/types';

type Destination = ArrayBuffer | Buffer | Uint8Array;

export default class MergerStream<T: Destination = Uint8Array> extends BaseMergerStream<T> {
  constructor({ type = Uint8Array }: { type?: Class<T> } = {}) {
    if (![ArrayBuffer, Buffer, Uint8Array].some(klass => type === klass))
      throw new InvalidArgument('options.type', 'class in [ArrayBuffer, Buffer, Uint8Array]', type);

    const converter = input => castData(input, { type });

    super(converter);
  }
}
