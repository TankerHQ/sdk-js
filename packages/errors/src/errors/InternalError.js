// @flow
import { TankerError } from '../TankerError';

export class InternalError extends TankerError {
  constructor(message: string) {
    super('InternalError', message);
  }
}
