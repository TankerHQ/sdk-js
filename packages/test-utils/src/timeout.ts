export const makeTimeoutPromise = (delay: number): {
  promise: Promise<void>;
  reset: () => void;
} => {
  let reset;
  let timeout;

  const promise = new Promise(resolve => {
    reset = () => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(resolve, delay);
    };
  });
  // $FlowIgnore reset is always initialized in the Promise
  reset();
  // $FlowIgnore reset is always initialized in the Promise
  return { promise, reset };
};
