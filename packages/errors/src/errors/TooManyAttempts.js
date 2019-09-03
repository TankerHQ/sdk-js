// @flow
import { TankerError } from '../TankerError';

export class TooManyAttempts extends TankerError {
  constructor(message: string) {
    super('TooManyAttempts', message);
  }
}
