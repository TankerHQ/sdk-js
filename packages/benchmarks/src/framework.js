// @flow
/* eslint-disable no-underscore-dangle */

// Number of times to loop over the same benchmark
const sampleCount = 5;
// Duration threshold over which we should not take more samples
const stopSamplingThreshold = 5;

const benchmarks = [];
let beforeAll = null;
let afterAll = null;

global.__karma__.start = async () => {
  try {
    if (beforeAll)
      await beforeAll();
  } catch (e) {
    console.error('`before` failed:', e);
    global.__karma__.result({ id: 'before', success: false });
    global.__karma__.complete({});
    return;
  }

  try {
    for (const bench of benchmarks) {
      await bench(global.__karma__.result);
    }
  } catch (e) {
    console.error('FATAL ERROR: there was an error with the benchmark framework itself');
    console.error('FATAL ERROR:', e);
  }

  try {
    if (afterAll)
      await afterAll();
  } catch (e) {
    console.error('`after` failed:', e);
    global.__karma__.result({ id: 'after', success: false });
  }

  global.__karma__.complete({});
};

function getTime(): number {
  return (new Date()).getTime() / 1000;
}

export class State {
  startTime: number;
  pauseTime: ?number;
  durations: Array<number>;
  pauseDuration: number;

  constructor() {
    this.pauseTime = null;
    this.durations = [];
  }

  pause = () => {
    if (!this.startTime)
      throw new Error('pausing but benchmark has not started yet');
    if (this.pauseTime)
      throw new Error('pausing while already paused');
    this.pauseTime = getTime();
  }
  unpause = () => {
    const pauseTime = this.pauseTime;
    if (!pauseTime)
      throw new Error('unpausing while already unpaused');
    const now = getTime();
    this.pauseDuration += now - pauseTime;
    this.pauseTime = null;
  }

  iter = () => {
    if (this.startTime) {
      if (this.pauseTime)
        this.unpause();
      const end = getTime();
      const time = end - this.startTime - this.pauseDuration;
      this.durations.push(time);

      if (time > stopSamplingThreshold)
        return false;
    }
    this.startTime = getTime();
    this.pauseDuration = 0.0;
    return this.durations.length < sampleCount;
  };
}

export function before(fn: Function) {
  beforeAll = fn;
}

export function after(fn: Function) {
  afterAll = fn;
}

// https://stackoverflow.com/a/53660837/1401962
function median(numbers: Array<number>) {
  const sorted = numbers.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

export function benchmark(name: string, fn: Function) {
  benchmarks.push(async (result) => {
    try {
      const state = new State();

      await fn(state);

      // skip the first element, consider it warm-up
      if (state.durations.length >= 2)
        state.durations.shift();
      const meanTime = median(state.durations);

      result({
        id: name,
        success: true,
        duration: meanTime,
      });
    } catch (e) {
      console.error(`Benchmark "${name}" failed:`, e);
      result({
        id: name,
        success: false,
      });
    }
  });
}
