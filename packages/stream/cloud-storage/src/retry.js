// @flow
type RetryOptions = $Exact<{
  retries: number,
  delayGenerator?: Function,
}>;

function* noDelayGenerator(retries: number): Generator<number, void, void> {
  let attempts = 0;

  while (attempts < retries) {
    yield 0;
    attempts += 1;
  }
}

// Implements exponential backoff: https://cloud.google.com/storage/docs/exponential-backoff
function* exponentialDelayGenerator(retries: number): Generator<number, void, void> {
  let attempts = 0;

  while (attempts < retries) {
    const seconds = 2 ** attempts;
    const randMilliSeconds = Math.floor(Math.random() * 1000);
    yield seconds * 1000 + randMilliSeconds;
    attempts += 1;
  }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retry = <T>(fn: () => Promise<T> | T, opts: RetryOptions): Promise<T> => {
  const { retries } = opts;
  const delayGenerator = opts.delayGenerator || exponentialDelayGenerator;

  const delays = delayGenerator(retries);

  const doTry = async () => {
    try {
      return await fn();
    } catch (err) {
      const { value, done } = delays.next();

      if (done) {
        throw err;
      }

      // $FlowIKnow done is false, so it's a yielded number (and not an undefined return value)
      await wait(value);

      return doTry();
    }
  };

  return doTry();
};

export {
  exponentialDelayGenerator,
  noDelayGenerator,
  retry,
};
