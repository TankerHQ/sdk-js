import { PromiseWrapper } from './PromiseWrapper';

type Fn<T> = () => Promise<T> | T;
type Task<T> = { fn: Fn<T>; pw: PromiseWrapper<T>; };

export class TaskQueue {
  declare _maxConcurrency: number;
  declare _resumeScheduled: boolean;
  declare _runningTasks: number;
  declare _tasks: Array<Task<any>>;

  constructor(maxConcurrency: number = 1) {
    this._maxConcurrency = maxConcurrency;
    this._resumeScheduled = false;
    this._runningTasks = 0;
    this._tasks = [];
  }

  enqueue<T>(fn: Fn<T>): Promise<T> {
    const pw: PromiseWrapper<T> = new PromiseWrapper();
    this._tasks.push({ fn, pw });
    this._resume();
    return pw.promise;
  }

  async _dequeue() {
    const { fn, pw } = this._tasks.shift()!;
    this._runningTasks += 1;

    try {
      const result = await fn();
      pw.resolve(result);
    } catch (e) {
      pw.reject(e);
    } finally {
      this._runningTasks -= 1;
      this._resume();
    }
  }

  _resume = async () => {
    if (this._resumeScheduled) return;

    this._resumeScheduled = true;

    try {
      // The line below is a trick to give a chance for the next task to be scheduled
      // asynchronously (and not straight away after execution of the previous one).
      // It avoids the use of platform specific (e.g. process.nextTick), non-standard
      // (e.g. setImmediate), or poorly performant (setTimeout) alternatives.
      await Promise.resolve();

      while (this._tasks.length > 0 && this._runningTasks < this._maxConcurrency) {
        this._dequeue();
      }
    } finally {
      this._resumeScheduled = false;
    }
  };
}
