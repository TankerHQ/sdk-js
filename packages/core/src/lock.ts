import { PreconditionFailed } from '@tanker/errors';

export class Lock {
  declare _owner: string | null;

  constructor() {
    this._owner = null;
  }

  async lock<T>(caller: string, callback: () => Promise<T>): Promise<T> {
    if (this.locked) {
      throw new PreconditionFailed(`A mutually exclusive call is already in progress: calling ${caller} while ${this.owner} is not resolved`);
    }
    let res: T;
    this._owner = caller;

    try {
      res = await callback();
    } finally {
      this._owner = null;
    }

    return res;
  }

  get locked(): boolean {
    return !!this._owner;
  }

  get owner(): string | null {
    return this._owner;
  }
}
