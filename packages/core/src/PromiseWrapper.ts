export class PromiseWrapper<T> {
  promise: Promise<T>;
  resolve: (arg0: T) => void;
  reject: (arg0: any) => void;
  settled: boolean = false;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = (v: T) => { this.settled = true; resolve(v); };
      this.reject = (e: any) => { this.settled = true; reject(e); };
    });
  }
}

export default PromiseWrapper;
