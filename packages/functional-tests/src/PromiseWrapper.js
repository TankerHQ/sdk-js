// @flow
export class PromiseWrapper<T> {
  promise: Promise<T>;
  resolve: (T) => void;
  reject: (any) => void;
  settled: bool = false;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = (v: T) => { this.settled = true; resolve(v); };
      this.reject = (e: any) => { this.settled = true; reject(e); };
    });
  }
}

export default PromiseWrapper;
