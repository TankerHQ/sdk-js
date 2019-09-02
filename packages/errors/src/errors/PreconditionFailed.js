// @flow
import { TankerError } from '../TankerError';

export class PreconditionFailed extends TankerError {
  constructor(message: string) {
    super('PreconditionFailed', message);
  }
}
