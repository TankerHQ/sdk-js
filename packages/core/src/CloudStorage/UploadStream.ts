import type { WriteCallback, DestroyCallback } from '@tanker/stream-base';
import { Writable, Transform } from '@tanker/stream-base';
import type { b64string } from '@tanker/crypto';

export class UploadStream extends Writable {
  _b64resourceId: b64string;
  _headStream: Transform;
  _tailStream: Writable;
  _streams: Array<Transform | Writable>;

  _tailStreamFinishPromise: Promise<void>;

  constructor(b64resourceId: b64string, streams: Array<Transform | Writable>) {
    super({
      highWaterMark: 1,
      objectMode: true,
    });
    this._b64resourceId = b64resourceId;
    this._streams = streams;
    this._headStream = this._streams[0] as Transform;

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

  override _destroy(error: Error | null, callback: DestroyCallback) {
    this._streams.forEach((stream: Transform | Writable) => stream.destroy());
    callback(error);
  }

  override _write(
    chunk: Uint8Array | string | any,
    encoding: string,
    callback: WriteCallback,
  ) {
    this._headStream.write(chunk, encoding, callback);
  }

  override async _final(callback: WriteCallback) {
    this._headStream.end();

    try {
      await this._tailStreamFinishPromise;
    } catch (e) {
      callback(e as Error);
      return;
    }
    callback();
  }
}
