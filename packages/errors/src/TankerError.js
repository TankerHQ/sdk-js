// @flow
export class TankerError extends Error {
  constructor(name: string = 'TankerError', message?: string) {
    super(message);
    this.name = name;
  }

  toString() {
    return `[Tanker] ${super.toString()}`;
  }
}
