// @flow
import { InvalidArgument } from '@tanker/errors';

export type ProgressReport = $Exact<{ currentBytes: number, totalBytes?: number }>;
export type OnProgress = (report: ProgressReport) => void;

export class ProgressHandler {
  _currentBytes: number = 0;
  _onProgress: OnProgress;
  _totalBytes: ?number;

  constructor(options: { onProgress?: OnProgress } = {}) {
    // $FlowIKnow Use of Object.prototype
    if (!options || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype)
      throw new InvalidArgument('options', 'object', options);

    if ('onProgress' in options) {
      const { onProgress } = options;

      if (typeof onProgress !== 'function')
        throw new InvalidArgument('options.onProgress', 'functions', onProgress);

      this._onProgress = onProgress;
    } else {
      // default to no-op
      this._onProgress = (report: ProgressReport) => {}; // eslint-disable-line no-unused-vars
    }
  }

  start = (totalBytes: ?number) => {
    if (typeof totalBytes !== 'undefined') {
      if (typeof totalBytes !== 'number' || totalBytes < 0 || Math.floor(totalBytes) !== totalBytes)
        throw new InvalidArgument('totalBytes', 'integer >= 0', totalBytes);
      this._totalBytes = totalBytes;
    }

    this.report(0);
    return this;
  }

  report = (bytesRead: number) => {
    this._currentBytes += bytesRead;

    const progressReport = typeof this._totalBytes === 'number'
      ? { currentBytes: this._currentBytes, totalBytes: this._totalBytes }
      : { currentBytes: this._currentBytes };

    this._onProgress(progressReport);
  }
}
