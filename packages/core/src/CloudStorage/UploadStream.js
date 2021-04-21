// @flow
import { Writable, Transform, type DoneCallback } from '@tanker/stream-base';
import type { b64string } from '@tanker/crypto';

export class UploadStream
  extends Writable {
  _b64resourceId: b64string;
  _headStream: Transform;
  _tailStream: Writable;
  _streams: Array<Transform | Writable>;

  _tailStreamFinishPromise: Promise<void>;

  constructor(b64resourceId: b64string, streams: Array<Transform | Writable>) {
    super(
      {
        highWaterMark: 1,
        objectMode: true,
      },
    );
    this._b64resourceId = b64resourceId;
    this._streams = streams;
    this._headStream = this._streams[0];

    this._streams.forEach(
      (stream: Transform | Writable) => stream.on(
        'error',
        (err: Error) => this.destroy(err),
      ),
    );

    this._tailStream = this._streams.reduce(
      (leftStream, rightStream) => leftStream.pipe(rightStream),
    );

    this._tailStreamFinishPromise = new Promise(
      (resolve, reject) => {
        this._streams.forEach(
          (stream: Transform | Writable) => stream.once('error', reject),
        );
        this._tailStream.once('finish', resolve);
      },
    );
  }

  get resourceId(): b64string {
    return this._b64resourceId;
  }

  _destroy(error: Error, callback: DoneCallback) {
    this._streams.forEach((stream: Transform | Writable) => stream.destroy());
    callback(error);
  }

  _write(
    chunk: Uint8Array | string | any,
    encoding: string,
    callback: DoneCallback,
  ) {
    this._headStream.write(chunk, encoding, callback);
  }

  async _final(callback: DoneCallback) {
    this._headStream.end();

    try {
      await this._tailStreamFinishPromise;
    } catch (e) {
      callback(e);
      return;
    }
    callback();
  }
}
