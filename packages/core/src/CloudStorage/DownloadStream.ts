import type { DestroyCallback } from '@tanker/stream-base';
import { Transform, Readable } from '@tanker/stream-base';
import type { Stream } from 'readable-stream';
import type { ResourceMetadata } from '@tanker/types';

export class DownloadStream extends Readable implements Stream {
  _resourceMetadata: ResourceMetadata;
  _headStream: Readable;
  _tailStream: Transform;
  _streams: Array<Transform | Readable>;

  constructor(streams: Array<Readable | Transform>, resourceMetadata: ResourceMetadata) {
    super({
      highWaterMark: 1,
      objectMode: true,
    });
    this._resourceMetadata = resourceMetadata;
    this._streams = streams;
    this._headStream = streams[0] as Readable;

    this._streams.forEach((stream: Readable | Transform) => stream.on('error', (err: Error) => this.destroy(err)));

    // @types/readable-stream is ill-typed. The `pipe()` is part of the interface of Readable
    // see https://nodejs.org/docs/latest-v16.x/api/stream.html#stream_readable_pipe_destination_options
    // We also know that only the first stream is a Readable. Every Other stream is a Transform
    // @ts-expect-error
    this._tailStream = streams.reduce((leftStream, rightStream) => leftStream.pipe(rightStream));
    this._tailStream.on('end', () => {
      this.push(null);
    });
    this._tailStream.on('data', (data: Uint8Array | string | any, encoding: string) => {
      if (!this.push(data, encoding)) {
        this._tailStream.pause();
      }
    });
  }

  get metadata(): ResourceMetadata {
    return this._resourceMetadata;
  }

  override _destroy(error: Error, callback: DestroyCallback) {
    this._streams.forEach((stream: Transform | Readable) => stream.destroy());
    callback(error);
  }

  override _read() {
    this._tailStream.resume();
  }

  // Readable.pipe() is not defined in @types/readable-stream. They use another interface
  // which does not follow the spec from https://nodejs.org/docs/latest-v16.x/api/stream.html
  // @ts-expect-error
  public pipe = <T extends Writable>(destination: T, options?: { end: boolean }): T => super.pipe(destination, options);
}
