// @flow
import { TankerError } from '../TankerError';

export class ExpiredVerification extends TankerError {
  constructor(message: string) {
    super('ExpiredVerification', message);
  }
}
