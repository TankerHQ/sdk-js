export const makeTimeoutPromise = (delay: number): {
  promise: Promise<void>;
  reset: () => void;
} => {
  let reset!: () => void;
  let timeout: ReturnType<typeof setTimeout>;

  const promise: Promise<void> = new Promise(resolve => {
    reset = () => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(resolve, delay);
    };
  });
  reset();
  return { promise, reset };
};
