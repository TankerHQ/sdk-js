// @flow
import { PreconditionFailed } from '@tanker/errors';

export class Lock {
  declare _owner: ?string;
  constructor() {
    this._owner = null;
  }

  async lock<T>(caller: string, callback: () => Promise<T>): Promise<T> {
    if (this.locked) {
      // $FlowExpectedErrorNextLine _owner cannot be empty if locked === true
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

  get locked(): bool {
    return !!this._owner;
  }

  get owner(): ?string {
    return this._owner;
  }
}
