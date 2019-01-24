// @flow
class TaskQueue {
  _queue = [];
  _running = false;

  _ready(): Promise<void> {
    const handle = new Promise<void>(resolve => this._queue.push(resolve));

    if (!this._running) {
      this._dispatchTask();
    }

    return handle;
  }

  async enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    await this._ready();

    try {
      return await task();
    } finally {
      this._dispatchTask();
    }
  }

  _dispatchTask(): void {
    if (this._queue.length > 0) {
      this._running = true;
      const resumeTask = this._queue.shift();
      resumeTask();
    } else {
      this._running = false;
    }
  }
}

export default TaskQueue;
