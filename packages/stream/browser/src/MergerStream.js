// @flow
import { InvalidArgument } from '@tanker/errors';
import { BaseMergerStream } from '@tanker/stream-base';
import FilePonyfill from '@tanker/file-ponyfill';
import { castData } from '@tanker/types';

export type Destination = ArrayBuffer | Blob | File | Uint8Array;

export default class MergerStream<T: Destination = Uint8Array> extends BaseMergerStream<T> {
  constructor({ type = Uint8Array, mime, name, lastModified }: { type?: Class<T>, mime?: string, name?: string, lastModified?: number } = {}) {
    if (![ArrayBuffer, Blob, File, FilePonyfill, Uint8Array].some(klass => type === klass))
      throw new InvalidArgument('options.type', 'class in [ArrayBuffer, Blob, File, FilePonyfill, Uint8Array]', type);

    if (mime && typeof mime !== 'string')
      throw new InvalidArgument('options.mime', 'string', mime);

    if (name && typeof name !== 'string')
      throw new InvalidArgument('options.name', 'string', name);

    const converter = input => castData(input, { type, mime, name, lastModified });

    super(converter);
  }
}
