export type DelayGenerator = (retries: number) => Generator<number, void, void>;

export function* zeroDelayGenerator(retries: number): Generator<number, void, void> {
  let attempts = 0;

  while (attempts < retries) {
    yield 0;
    attempts += 1;
  }
}

// Implements exponential backoff: https://cloud.google.com/storage/docs/exponential-backoff
export function* exponentialDelayGenerator(retries: number): Generator<number, void, void> {
  let attempts = 0;

  while (attempts < retries) {
    const seconds = 2 ** attempts;
    const randMilliSeconds = Math.floor(Math.random() * 1000);
    yield seconds * 1000 + randMilliSeconds;
    attempts += 1;
  }
}
