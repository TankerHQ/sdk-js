// @flow
import { Transform, Readable, type DoneCallback } from '@tanker/stream-base';
import type { ResourceMetadata } from '@tanker/types';

export class DownloadStream extends Readable {
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
      this._headStream = streams[0];

      this._streams.forEach((stream: Readable | Transform) => stream.on('error', (err: Error) => this.destroy(err)));

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

    _destroy(error: Error, callback: DoneCallback) {
      this._streams.forEach((stream: Transform | Readable) => stream.destroy());
      callback(error);
    }

    _read() {
      this._tailStream.resume();
    }
}
