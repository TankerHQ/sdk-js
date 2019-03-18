// @flow
import { TankerError } from '@tanker/errors';

export class InvalidIdentity extends TankerError {
  next: ?Error;

  constructor(e: Error | string) {
    if (typeof e === 'string') {
      super('InvalidIdentity', e);
    } else {
      super('InvalidIdentity');
      this.next = e;
    }
  }
}
