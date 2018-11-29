// @flow

import { Transform } from 'readable-stream';

import { Uint8Stream } from './Uint8Stream';
import PromiseWrapper from './PromiseWrapper';
import { BrokenStream, StreamAlreadyClosed } from './errors';

type Sizes = {
  inputSize: number,
  outputSize: number
};

type Callbacks = {
  onData: Function,
  onEnd: Function,
  onError: ?Function
}

function configureInputStream(inputSize: number, callback: { onDrain: Function, onError: Function }) {
  const inputStream = new Uint8Stream(inputSize);

  inputStream.on('drain', callback.onDrain);
  inputStream.on('error', callback.onError);
  return inputStream;
}

function configureOutputStream(outputSize: number, callback: { onData: Function, onEnd: Function, onError: Function }) {
  const outputStream = new Uint8Stream(outputSize);

  outputStream.on('data', async (data) => {
    outputStream.pause();
    try {
      await callback.onData(data);
    } catch (err) {
      callback.onError(err);
    }
    outputStream.resume();
  });
  outputStream.on('end', callback.onEnd);
  outputStream.on('error', callback.onError);
  return outputStream;
}


export default class BufferedTransformStream {
  onEnd: () => Promise<void> | void;
  onError: (Error) => Promise<void> | void;
  _outputSize: number;
  _inputSize: number;

  _waitingPromise: ?PromiseWrapper<void>;
  _endPromise: ?PromiseWrapper<void>;
  _error: ?Error;
  _closed: bool = false;

  inputStream: Uint8Stream;
  transformStream: Transform;
  outputStream: Uint8Stream;

  constructor(transform: Transform, callbacks: Callbacks, sizes: Sizes) {
    this.onEnd = callbacks.onEnd;
    this.onError = (error) => {
      this._error = error;
      try {
        if (callbacks.onError)
          callbacks.onError(error);
      } catch (e) {
        console.error(e);
      } finally {
        if (this._waitingPromise) {
          this._waitingPromise.reject(new BrokenStream(this._error));
        }
        if (this._endPromise) {
          this._endPromise.reject(new BrokenStream(this._error));
        }
      }
    };
    this._inputSize = sizes.inputSize;
    this._outputSize = sizes.outputSize;

    this.inputStream = configureInputStream(this._inputSize, {
      onDrain: () => {
        if (this._waitingPromise) {
          const promise = this._waitingPromise;
          delete this._waitingPromise;
          promise.resolve();
        }
      },
      onError: this.onError
    });

    this.transformStream = transform;
    transform.on('error', this.onError);

    this.outputStream = configureOutputStream(this._outputSize, {
      onData: callbacks.onData,
      onEnd: () => {
        if (this._endPromise) {
          this._endPromise.resolve();
        } else {
          throw new Error('Assertion failed: Stream is closing without endPromise');
        }
      },
      onError: this.onError
    });

    this.inputStream.pipe(this.transformStream).pipe(this.outputStream);
  }

  integrityCheck() {
    if (this._error) {
      throw new BrokenStream(this._error);
    }
    if (this._closed) {
      throw new StreamAlreadyClosed();
    }
  }

  async write(clearData: Uint8Array): Promise<void> {
    this.integrityCheck();

    if (!this.inputStream.write(clearData)) {
      if (!this._waitingPromise) {
        this._waitingPromise = new PromiseWrapper();
      }
      return this._waitingPromise.promise;
    }
  }

  output(data: Uint8Array) {
    this.outputStream.write(data);
  }

  async close(): Promise<void> {
    this.integrityCheck();

    this._closed = true;
    this._endPromise = new PromiseWrapper();
    this.inputStream.end();
    // $FlowIKnow got assigne two ligne upper
    await this._endPromise.promise;
    return this.onEnd();
  }
}
